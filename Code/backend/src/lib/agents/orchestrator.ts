import { randomUUID } from 'node:crypto'
import { classifyIntent } from './intent'
import { ContextService } from '../context/service'
import { sandboxManager } from '../sandbox/manager'
import { workflowEngine } from '../workflows/engine'
import { ArtifactRepo } from '../../repositories/artifact.repo'
import { storageService } from '../supabase/storage'
import { llmRegistry } from '../llm/registry'
import { ConnectorSession } from '../mcp/connectors/session'
import { loadUserConnectors } from '../integrations/userConnectors'
import { getDynamicTools, addDynamicTool, fillTemplate, type DynamicTool } from '../integrations/dynamicTools'
import { GenericRestConnector } from '../mcp/connectors/generic'
import type { ConnectorConfig, Connector } from '../mcp/connectors/types'
import type { LLMMessage, ToolDefinition } from '../llm/types'
import type { WorkflowEvent, WorkflowDefinition } from '../../types/workflow'
import type { ContextSnapshot } from '../../types/context'
import type { Role } from '../../types/common'

interface DiscoveredOperation { name: string; method: string; path: string; description: string }

// Build a compact capability block from generic connectors in this session.
// This tells the agent what endpoints actually exist (and what doesn't),
// preventing guessing that leads to 404s.
function buildConnectorCapabilityContext(extraConnectors: Connector[]): string {
  const blocks: string[] = []
  for (const conn of extraConnectors) {
    if (!(conn instanceof GenericRestConnector)) continue
    const entry = (conn as GenericRestConnector & { entry: { discovery_metadata: unknown; display_name: string } }).entry
    if (!entry) continue
    const meta = (entry.discovery_metadata ?? {}) as Record<string, unknown>
    const ops = (Array.isArray(meta.common_operations) ? meta.common_operations : []) as DiscoveredOperation[]
    const limits = (Array.isArray(meta.api_limitations) ? meta.api_limitations : []) as string[]
    if (!ops.length && !limits.length) continue
    const lines: string[] = [`[${entry.display_name} API]`]
    if (ops.length) {
      lines.push('  Available operations:')
      ops.forEach((o) => lines.push(`    ${o.method} ${o.path}${o.description ? ` — ${o.description}` : ''}`))
    }
    if (limits.length) {
      lines.push('  Limitations (do NOT attempt):')
      limits.forEach((l) => lines.push(`    • ${l}`))
    }
    blocks.push(lines.join('\n'))
  }
  return blocks.length ? blocks.join('\n\n') : ''
}

// Mime types whose contents can be inlined into the prompt as text.
const TEXT_MIME_PREFIXES = ['text/']
const TEXT_MIME_EXACT = new Set([
  'application/json',
  'application/xml',
  'application/javascript',
  'application/typescript',
  'application/x-yaml',
  'application/csv',
])
const MAX_ATTACHMENT_CHARS = 12_000

function isTextMime(mime: string | null): boolean {
  if (!mime) return false
  return TEXT_MIME_PREFIXES.some((p) => mime.startsWith(p)) || TEXT_MIME_EXACT.has(mime)
}

// Fetch attached artifacts and build a text block to inject into the prompt so
// the LLM can actually reason over uploaded file contents. Binary files are
// referenced by name/type rather than inlined.
async function buildAttachmentContext(
  attachmentIds: string[],
  tenantId: string,
  userId: string,
): Promise<string> {
  if (!attachmentIds.length) return ''
  const repo = new ArtifactRepo()
  const artifacts = await repo.findByIds(attachmentIds, tenantId, userId)
  if (!artifacts.length) return ''

  const blocks: string[] = []
  for (const a of artifacts) {
    const name = (a.metadata as { originalName?: string })?.originalName ?? a.storage_path.split('/').pop() ?? 'file'
    if (isTextMime(a.mime_type)) {
      try {
        const buf = await storageService.download('uploads', a.storage_path)
        let content = buf.toString('utf-8')
        if (content.length > MAX_ATTACHMENT_CHARS) {
          content = content.slice(0, MAX_ATTACHMENT_CHARS) + '\n…[truncated]'
        }
        blocks.push(`File: ${name} (${a.mime_type})\n---\n${content}\n---`)
      } catch {
        blocks.push(`File: ${name} (${a.mime_type}) — could not read contents.`)
      }
    } else {
      blocks.push(`File: ${name} (${a.mime_type ?? 'unknown'}, ${a.size_bytes ?? 0} bytes) — binary attachment.`)
    }
  }

  return `The user attached the following file(s). Use them as context when responding.\n\n${blocks.join('\n\n')}`
}

// Common cases where the Python import name differs from the PyPI package name.
const MODULE_TO_PACKAGE: Record<string, string> = {
  cv2: 'opencv-python-headless',
  PIL: 'pillow',
  bs4: 'beautifulsoup4',
  yaml: 'pyyaml',
  sklearn: 'scikit-learn',
  skimage: 'scikit-image',
  Crypto: 'pycryptodome',
  dotenv: 'python-dotenv',
  dateutil: 'python-dateutil',
  fitz: 'pymupdf',
  docx: 'python-docx',
  pptx: 'python-pptx',
  serial: 'pyserial',
}

// Extract the missing top-level module from a Python ModuleNotFoundError.
function parseMissingModule(stderr?: string): string | null {
  if (!stderr) return null
  const m = stderr.match(/No module named ['"]([^'".]+)/)
  return m ? m[1] : null
}

function pipInstallCode(pkg: string): string {
  return [
    'import sys, subprocess',
    `subprocess.check_call([sys.executable, '-m', 'pip', 'install', '-q', '--no-input', ${JSON.stringify(pkg)}])`,
  ].join('\n')
}

function pipUninstallCode(packages: string[]): string {
  const list = JSON.stringify(packages)
  return [
    'import sys, subprocess',
    `subprocess.run([sys.executable, '-m', 'pip', 'uninstall', '-y', '-q', *${list}])`,
  ].join('\n')
}

// Runtime errors that indicate a missing OS-level dependency (not a pip module)
// and the apt package that satisfies them.
const SYSTEM_DEPS: { pattern: RegExp; apt: string }[] = [
  { pattern: /tesseract is not installed|TesseractNotFound/i, apt: 'tesseract-ocr' },
  { pattern: /libGL\.so|libgl1/i, apt: 'libgl1' },
  { pattern: /ffmpeg/i, apt: 'ffmpeg' },
]

function aptInstallCode(pkg: string): string {
  return [
    'import subprocess',
    `r = subprocess.run("sudo apt-get update -qq && sudo apt-get install -y -qq ${pkg}", shell=True, capture_output=True, text=True)`,
    'if r.returncode != 0:',
    '    raise RuntimeError("apt failed: " + (r.stderr or "")[-300:])',
  ].join('\n')
}

// Map a fence tag / language name to a canonical key.
function normalizeLang(tag: string): string {
  const t = (tag || '').trim().toLowerCase()
  const alias: Record<string, string> = {
    'c++': 'cpp', cc: 'cpp', cxx: 'cpp', 'h': 'cpp',
    js: 'javascript', node: 'javascript', mjs: 'javascript',
    ts: 'typescript',
    py: 'python', python3: 'python',
    golang: 'go',
    sh: 'bash', shell: 'bash', zsh: 'bash',
    rs: 'rust', rb: 'ruby',
  }
  return alias[t] ?? t
}

// Per-language run recipe for the generic (non-Python) sandbox path. cmd runs in
// /home/user; `tool` is the binary that must exist, `apt` installs it if missing.
const LANG_RUNNERS: Record<string, { file: string; cmd: string; tool: string; apt?: string }> = {
  cpp: { file: 'main.cpp', cmd: 'g++ -O2 -std=c++17 main.cpp -o prog && ./prog', tool: 'g++', apt: 'g++' },
  c: { file: 'main.c', cmd: 'gcc -O2 main.c -o prog && ./prog', tool: 'gcc', apt: 'gcc' },
  javascript: { file: 'main.js', cmd: 'node main.js', tool: 'node', apt: 'nodejs' },
  typescript: { file: 'main.ts', cmd: 'npx -y tsx main.ts', tool: 'node', apt: 'nodejs' },
  java: { file: 'Main.java', cmd: 'javac Main.java && java Main', tool: 'javac', apt: 'default-jdk' },
  go: { file: 'main.go', cmd: 'go run main.go', tool: 'go', apt: 'golang-go' },
  rust: { file: 'main.rs', cmd: 'rustc -O main.rs -o prog && ./prog', tool: 'rustc', apt: 'rustc' },
  ruby: { file: 'main.rb', cmd: 'ruby main.rb', tool: 'ruby', apt: 'ruby' },
  php: { file: 'main.php', cmd: 'php main.php', tool: 'php', apt: 'php-cli' },
  bash: { file: 'main.sh', cmd: 'bash main.sh', tool: 'bash' },
}

// Parse one fenced code block, returning its language and code. Falls back to
// Python (the default sandbox kernel) when no language tag is present.
function parseCodeBlock(text: string): { lang: string; code: string } {
  const t = text.trim()
  const fenced = t.match(/```([a-zA-Z0-9+#._-]*)\s*\n([\s\S]*?)\n?```/)
  if (fenced) return { lang: normalizeLang(fenced[1]) || 'python', code: fenced[2].trim() }
  return { lang: 'python', code: stripCodeFences(t) }
}

// The code-gen model is instructed to emit raw code, but it does not always
// comply and may wrap output in markdown fences (```python … ```). Strip them
// so the sandbox receives valid, executable source.
function stripCodeFences(text: string): string {
  const trimmed = text.trim()
  const fenced = trimmed.match(/^```[a-zA-Z0-9]*\s*\n([\s\S]*?)\n?```$/)
  if (fenced) return fenced[1].trim()
  // Fallback: drop any stray leading/trailing fence lines.
  return trimmed
    .replace(/^```[a-zA-Z0-9]*\s*\n?/, '')
    .replace(/\n?```$/, '')
    .trim()
}

interface WorkflowOpts {
  model?: string
  // Optional custom agent system prompt that overrides the default persona.
  systemPromptOverride?: string
}

function buildWorkflow(
  intent: string,
  snapshot: ContextSnapshot,
  opts: WorkflowOpts = {},
): WorkflowDefinition {
  // snapshot.messages already includes the current user turn, so we map it
  // directly rather than appending `prompt` again (which duplicated the turn).
  const messages = snapshot.messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : ('user' as const),
    content: m.content,
  }))
  const { model, systemPromptOverride } = opts

  // Each code-execution command must be independent — only the current request
  // is sent to the code generator, so the second command in a conversation does
  // not regenerate/re-run everything from earlier turns.
  const lastUser = [...messages].reverse().find((m) => m.role === 'user')
  const codeMessages = lastUser ? [lastUser] : messages

  switch (intent) {
    case 'code_execution':
      return {
        name: 'code_execution_workflow',
        steps: [
          {
            id: '1',
            name: 'Plan code',
            tool: 'llm.generate',
            input: {
              messages: codeMessages,
              model,
              systemPrompt:
                systemPromptOverride ??
                'You are an expert programmer. Generate working Python code to fulfil the user request. ' +
                'The code runs non-interactively in a sandbox with NO stdin — never call input() or wait for user input; ' +
                'if a value is unknown, define a sensible placeholder variable instead. ' +
                'Always print results to stdout so there is visible output. ' +
                'Output ONLY the code, no explanation, no markdown fences.',
              temperature: 0.3,
            },
          },
        ],
      }

    case 'conversation':
    default:
      return {
        name: 'conversation_workflow',
        steps: [
          {
            id: '1',
            name: 'Generate response',
            tool: 'llm.generate',
            input: {
              messages,
              model,
              systemPrompt:
                systemPromptOverride ??
                'You are a helpful, concise AI assistant. Answer the user clearly and accurately.',
              temperature: 0.7,
            },
          },
        ],
      }
  }
}

export class AgentOrchestrator {
  private contextService = new ContextService()

  async *execute(
    prompt: string,
    tenantId: string,
    userId: string,
    role: Role,
    conversationId?: string,
    attachmentIds: string[] = [],
    forceCodeExecution = false,
    model?: string,
    agentSystemPrompt?: string,
    connectors: ConnectorConfig[] = [],
  ): AsyncGenerator<WorkflowEvent> {
    // 1. Ensure conversation exists
    if (!conversationId) {
      throw new Error('conversationId is required for orchestrated execution')
    }

    // 2. Read any attached files and fold their contents into the user turn so
    //    the LLM can actually see them. The persisted message keeps the original
    //    prompt plus a short note of which files were attached.
    const attachmentContext = await buildAttachmentContext(attachmentIds, tenantId, userId)
    const persistedPrompt = attachmentContext
      ? `${prompt}\n\n[Attached ${attachmentIds.length} file(s)]`
      : prompt
    const llmPrompt = attachmentContext ? `${attachmentContext}\n\n${prompt}` : prompt

    // 3. Persist user message (original prompt + attachment note)
    await this.contextService.appendUserMessage(conversationId, tenantId, persistedPrompt)

    // 4. Build context snapshot, then swap the last user turn for the
    //    attachment-augmented version (not persisted) for the LLM only.
    const snapshot = await this.contextService.buildSnapshot(conversationId, tenantId, userId)
    if (attachmentContext) {
      for (let i = snapshot.messages.length - 1; i >= 0; i--) {
        if (snapshot.messages[i]!.role === 'user') {
          snapshot.messages[i] = { ...snapshot.messages[i]!, content: llmPrompt }
          break
        }
      }
    }

    // 5. Load connectors first so intent classification is connector-aware:
    //    actions on a connected app must NOT be misrouted to the code sandbox.
    const userConnectors = await loadUserConnectors(tenantId, userId)
    const hasConnectors = connectors.length > 0 || userConnectors.length > 0
    const connectedAppsHint = hasConnectors
      ? [...userConnectors.map((c) => c.config.name), ...connectors.map((c) => c.name)].join(', ') +
        ' (e.g. notes, pages, databases, tasks, records, files in those apps)'
      : undefined

    const intent = forceCodeExecution
      ? 'code_execution'
      : await classifyIntent(prompt, snapshot.messages, model, connectedAppsHint)

    if (intent === 'code_execution') {
      yield* this.runCodeExecution(conversationId, tenantId, userId, role, snapshot, prompt, model, agentSystemPrompt, attachmentIds)
      return
    }

    // 5b. Non-code requests with connectors → agentic tool loop (uses tools only
    //     as needed, and invents new ones via define_connector_function).
    if (hasConnectors) {
      yield* this.runWithConnectors(conversationId, tenantId, userId, snapshot, connectors, model, agentSystemPrompt, userConnectors)
      return
    }

    // 6. Build workflow definition (with chosen model + optional agent persona)
    const definition = buildWorkflow(intent, snapshot, { model, systemPromptOverride: agentSystemPrompt })

    // 7–9. Execute workflow (handles MCP resolution, retries, state persistence)
    let assistantResponse = ''

    try {
      for await (const event of workflowEngine.execute(
        definition,
        snapshot,
        undefined,
        tenantId,
        userId,
        conversationId,
      )) {
        if (event.type === 'step.completed' && event.result) {
          const r = event.result as { content?: string }
          if (r.content) assistantResponse = r.content
        }
        yield event
      }
    } finally {
      if (assistantResponse) {
        await this.contextService.appendAssistantMessage(conversationId, tenantId, assistantResponse)
      }
    }
  }

  // Download attachment artifacts and return their bytes + a sandbox path so the
  // generated code can open them directly.
  private async resolveAttachments(
    attachmentIds: string[],
    tenantId: string,
    userId: string,
  ): Promise<Array<{ path: string; data: Uint8Array; mimeType: string; name: string }>> {
    if (!attachmentIds.length) return []
    const repo = new ArtifactRepo()
    const artifacts = await repo.findByIds(attachmentIds, tenantId, userId)
    const out: Array<{ path: string; data: Uint8Array; mimeType: string; name: string }> = []
    for (const a of artifacts) {
      try {
        const buf = await storageService.download('uploads', a.storage_path)
        const rawName = (a.metadata as { originalName?: string })?.originalName ?? a.storage_path.split('/').pop() ?? 'file'
        const safe = rawName.replace(/[^a-zA-Z0-9._-]/g, '_')
        out.push({ path: `/home/user/${safe}`, data: new Uint8Array(buf), mimeType: a.mime_type ?? 'application/octet-stream', name: safe })
      } catch {
        /* skip unreadable attachment */
      }
    }
    return out
  }

  // Run code, and if it fails because a library is missing, pip-install the
  // package and retry — tracking what we installed so it can be removed after.
  private async executeWithAutoDeps(
    sandboxId: string,
    tenantId: string,
    code: string,
  ): Promise<{ out: string; err: string; installed: string[]; log: string[] }> {
    const installed: string[] = []
    const log: string[] = []
    let exec = await sandboxManager.execute(sandboxId, tenantId, code)

    for (let attempt = 0; attempt < 6; attempt++) {
      // (a) Missing Python module → pip install.
      const missing = parseMissingModule(exec.stderr)
      if (missing) {
        const pkg = MODULE_TO_PACKAGE[missing] ?? missing
        if (!/^[a-zA-Z0-9._-]+$/.test(pkg) || installed.includes(pkg)) break
        log.push(`Installing missing library: ${pkg}…`)
        const install = await sandboxManager.execute(sandboxId, tenantId, pipInstallCode(pkg))
        if (install.exitCode !== 0) {
          log.push(`Could not install ${pkg}: ${(install.stderr || '').slice(0, 200)}`)
          break
        }
        installed.push(pkg)
        exec = await sandboxManager.execute(sandboxId, tenantId, code)
        continue
      }

      // (b) Missing system dependency (e.g. the Tesseract OCR engine) → apt-get.
      const sysDep = SYSTEM_DEPS.find((d) => d.pattern.test(exec.stderr ?? ''))
      if (sysDep && !installed.includes(sysDep.apt)) {
        log.push(`Installing system dependency: ${sysDep.apt}…`)
        const install = await sandboxManager.execute(sandboxId, tenantId, aptInstallCode(sysDep.apt))
        if (install.exitCode !== 0) {
          log.push(`Could not install ${sysDep.apt}: ${(install.stderr || '').slice(0, 200)}`)
          break
        }
        installed.push(sysDep.apt)
        exec = await sandboxManager.execute(sandboxId, tenantId, code)
        continue
      }

      break
    }

    return { out: exec.stdout?.trim() ?? '', err: exec.stderr?.trim() ?? '', installed, log }
  }

  // Uninstall libraries that were added just for this run.
  private async cleanupDeps(sandboxId: string, tenantId: string, packages: string[]): Promise<void> {
    if (!packages.length) return
    await sandboxManager.execute(sandboxId, tenantId, pipUninstallCode(packages)).catch(() => {})
  }

  // Generic, language-agnostic runner: write the source to a file and
  // compile/run it via the shell, auto-installing the toolchain (apt) or
  // packages (npm) if the first attempt reports them missing.
  private async runProgram(
    sandboxId: string,
    tenantId: string,
    lang: string,
    code: string,
  ): Promise<{ out: string; err: string; installed: string[]; log: string[] }> {
    const spec = LANG_RUNNERS[lang]
    const log: string[] = []
    const installed: string[] = []
    if (!spec) {
      return { out: '', err: `Unsupported language: ${lang}`, installed, log }
    }

    // Write the source file into the sandbox working dir.
    await sandboxManager.writeFiles(sandboxId, tenantId, [
      { path: `/home/user/${spec.file}`, data: new TextEncoder().encode(code) },
    ])
    const full = `cd /home/user && ${spec.cmd}`

    let res = await sandboxManager.runCommand(sandboxId, tenantId, full, 180)
    for (let attempt = 0; attempt < 4 && res.exitCode !== 0; attempt++) {
      const blob = `${res.stderr}\n${res.stdout}`
      // (a) toolchain/binary missing → apt-get install it.
      const toolMissing =
        res.exitCode === 127 ||
        new RegExp(`${spec.tool}: (command )?not found|not found: ${spec.tool}`, 'i').test(blob)
      if (toolMissing && spec.apt && !installed.includes(spec.apt)) {
        log.push(`Installing toolchain: ${spec.apt}…`)
        const inst = await sandboxManager.runCommand(sandboxId, tenantId, `sudo apt-get update -qq && sudo apt-get install -y -qq ${spec.apt}`, 300)
        if (inst.exitCode !== 0) { log.push(`Could not install ${spec.apt}`); break }
        installed.push(spec.apt)
        res = await sandboxManager.runCommand(sandboxId, tenantId, full, 180)
        continue
      }
      // (b) Node module missing → npm install it.
      const nodeMod = blob.match(/Cannot find (?:module|package) ['"]([^'"./][^'"]*)['"]/)
      if ((lang === 'javascript' || lang === 'typescript') && nodeMod) {
        const pkg = nodeMod[1].split('/')[0]
        if (!/^[a-zA-Z0-9@._-]+$/.test(pkg) || installed.includes(pkg)) break
        log.push(`Installing npm package: ${pkg}…`)
        const inst = await sandboxManager.runCommand(sandboxId, tenantId, `cd /home/user && npm install --no-save -s ${pkg}`, 240)
        if (inst.exitCode !== 0) { log.push(`Could not install ${pkg}`); break }
        installed.push(pkg)
        res = await sandboxManager.runCommand(sandboxId, tenantId, full, 180)
        continue
      }
      // (c) missing system library (shared by all languages).
      const sysDep = SYSTEM_DEPS.find((d) => d.pattern.test(blob))
      if (sysDep && !installed.includes(sysDep.apt)) {
        log.push(`Installing system dependency: ${sysDep.apt}…`)
        const inst = await sandboxManager.runCommand(sandboxId, tenantId, `sudo apt-get update -qq && sudo apt-get install -y -qq ${sysDep.apt}`, 300)
        if (inst.exitCode !== 0) break
        installed.push(sysDep.apt)
        res = await sandboxManager.runCommand(sandboxId, tenantId, full, 180)
        continue
      }
      break // a real compile/runtime error — surface it
    }

    return { out: (res.stdout ?? '').trim(), err: (res.stderr ?? '').trim(), installed, log }
  }

  // Code-execution flow: generate code for the CURRENT command, run it in a
  // sandbox, then have the LLM compose the final answer from the actual output.
  private async *runCodeExecution(
    conversationId: string,
    tenantId: string,
    userId: string,
    role: Role,
    snapshot: ContextSnapshot,
    prompt: string,
    model: string | undefined,
    agentSystemPrompt: string | undefined,
    attachmentIds: string[] = [],
  ): AsyncGenerator<WorkflowEvent> {
    const workflowId = randomUUID()
    const llm = llmRegistry.getDefault()
    // Use the (attachment-augmented) current user message only — each command is independent.
    const lastUser = [...snapshot.messages].reverse().find((m) => m.role === 'user')
    const userContent = lastUser?.content ?? prompt

    // Resolve attachments so binary files (images, etc.) can be written into the
    // sandbox for code to open by path.
    const attachments = await this.resolveAttachments(attachmentIds, tenantId, userId)

    let finalAnswer = ''
    let sandboxId: string | undefined
    let installedDeps: string[] = []

    yield { type: 'workflow.started', workflowId }
    try {
      // 1. Generate code in whatever language best fits the request.
      yield { type: 'step.started', stepId: 'plan', stepName: 'Plan code', tool: 'llm.generate' }
      const codeResp = await llm.generate({
        model,
        userId,
        systemPrompt:
          (agentSystemPrompt ? agentSystemPrompt + '\n\n' : '') +
          'You are an expert programmer. Write a complete, runnable program in the language that best fits ' +
          'the request (use the language the user asks for if they specify one). ' +
          'Output EXACTLY ONE fenced code block tagged with the language, e.g. ```python, ```cpp, ```javascript, ' +
          '```java, ```go, ```c, ```rust, ```ruby, ```php, ```bash — and nothing else outside the block. ' +
          'The program runs non-interactively with NO stdin — never read user input; use sensible placeholders. ' +
          (attachments.length
            ? 'These attached files are available at these exact paths — open them directly:\n' +
              attachments.map((a) => `  - ${a.path} (${a.mimeType})`).join('\n') + '\n'
            : 'If the request includes attached file contents inline, embed that text directly in the code. ') +
          'You may use third-party libraries; missing ones are installed automatically. ' +
          'Always print the results to stdout.',
        messages: [{ role: 'user', content: userContent }],
        temperature: 0.3,
      })
      const { lang, code } = parseCodeBlock(codeResp.content)
      yield { type: 'step.output', stepId: 'plan', chunk: `language: ${lang}\n\n${code}` }
      yield { type: 'step.completed', stepId: 'plan', result: {} }

      // 2. Run it in a sandbox.
      yield { type: 'step.started', stepId: 'sandbox', stepName: 'Sandbox execution', tool: 'sandbox' }
      const sandbox = await sandboxManager.create(tenantId, userId, role, 'ephemeral')
      sandboxId = sandbox.id
      await sandboxManager.injectContext(sandboxId, tenantId, snapshot)

      if (attachments.length) {
        await sandboxManager.writeFiles(
          sandboxId,
          tenantId,
          attachments.map((a) => ({ path: a.path, data: a.data })),
        )
      }

      // Python uses the Jupyter kernel (+ pip auto-install); any other language
      // is compiled/run via the shell with toolchain auto-install.
      const run =
        lang === 'python'
          ? await this.executeWithAutoDeps(sandboxId, tenantId, code)
          : await this.runProgram(sandboxId, tenantId, lang, code)
      installedDeps = run.installed
      const out = run.out
      const err = run.err
      const sandboxBody = out || err || '(no output)'
      const depNote = run.log.length ? run.log.join('\n') + '\n' : ''
      yield {
        type: 'step.output',
        stepId: 'sandbox',
        chunk: `${depNote}${sandboxBody}${out && err ? `\nSTDERR: ${err}` : ''}`,
      }

      // Clean up anything installed just for this run. Python pip packages are
      // uninstalled explicitly; toolchains/npm packages are discarded when the
      // ephemeral sandbox is torn down.
      if (installedDeps.length) {
        if (lang === 'python') await this.cleanupDeps(sandboxId, tenantId, installedDeps)
        yield { type: 'step.output', stepId: 'sandbox', chunk: `\n(temporary dependencies removed: ${installedDeps.join(', ')})` }
      }
      yield { type: 'step.completed', stepId: 'sandbox', result: {} }

      // 3. Compose the final answer FROM the sandbox output.
      yield { type: 'step.started', stepId: 'final', stepName: 'Compose answer', tool: 'llm.generate' }
      const finalResp = await llm.generate({
        model,
        userId,
        systemPrompt:
          (agentSystemPrompt ? agentSystemPrompt + '\n\n' : '') +
          'You are given a user request, the Python code that was run, and the program output. ' +
          'Write the final answer for the user using the actual output. Be concise and present the ' +
          'result clearly. If the output is an error, explain what went wrong.',
        messages: [
          { role: 'user', content: `Request: ${prompt}\n\nCode:\n${code}\n\nProgram output:\n${sandboxBody}` },
        ],
        temperature: 0.3,
      })
      finalAnswer = finalResp.content.trim() || sandboxBody
      yield { type: 'step.completed', stepId: 'final', result: { content: finalAnswer } }

      yield { type: 'workflow.completed', workflowId, result: { content: finalAnswer } }
    } catch (err) {
      yield { type: 'workflow.failed', workflowId, error: (err as Error).message }
    } finally {
      if (sandboxId) await sandboxManager.destroy(sandboxId, tenantId).catch(() => {})
      if (finalAnswer) {
        await this.contextService.appendAssistantMessage(conversationId, tenantId, finalAnswer).catch(() => {})
      }
    }
  }

  // Agentic loop: expose connector (MCP / MCP-adjacent) tools to the LLM, let it
  // call them, feed results back, and iterate until it produces a final answer.
  private async *runWithConnectors(
    conversationId: string,
    tenantId: string,
    userId: string,
    snapshot: ContextSnapshot,
    connectors: ConnectorConfig[],
    model: string | undefined,
    agentSystemPrompt: string | undefined,
    extraConnectors: Connector[] = [],
  ): AsyncGenerator<WorkflowEvent> {
    const MAX_ITERS = 12 // allow multi-step flows (search → define → call → define → call → answer)
    const workflowId = randomUUID()
    const session = new ConnectorSession(connectors, extraConnectors)
    const llm = llmRegistry.getDefault()

    // Connectors that expose a generic request capability can host dynamic tools.
    const providerMap = new Map<string, Connector>()
    for (const conn of extraConnectors) {
      if (conn.provider && typeof conn.rawRequest === 'function') providerMap.set(conn.provider, conn)
    }
    // User-defined dynamic tools (stored in their connector metadata, not code).
    let dynamicTools = await getDynamicTools(tenantId, userId)
    const dynamicDefs = (): ToolDefinition[] =>
      dynamicTools
        .filter((d) => providerMap.has(d.provider))
        .map((d) => ({ name: d.name, description: `[${d.provider} · custom] ${d.description}`, parameters: d.parameters }))

    // The meta-tool: lets the agent invent a NEW connector function at runtime.
    const META = 'define_connector_function'
    const metaDef: ToolDefinition = {
      name: META,
      description:
        'Create a NEW reusable tool for a connected service when no existing tool covers the request. ' +
        'Define it as a parameterised REST request template; it is saved to the user\'s connector and ' +
        'becomes immediately callable (and in future chats). Use {placeholder} in path/body to reference the parameters. ' +
        'Notion DATABASE example (a real database/data source with properties — NOT a table block): ' +
        'name "create_database", parameters {type:object, properties:{parent_id:{type:string}, title:{type:string}}, required:[parent_id,title]}, ' +
        'request {method:"POST", path:"/v1/databases", body:{parent:{type:"page_id", page_id:"{parent_id}"}, title:[{type:"text", text:{content:"{title}"}}], properties:{Name:{title:{}}, Status:{select:{options:[{name:"ToDo"},{name:"In Progress"},{name:"Done"}]}}}}}. ' +
        'Notion add-database-entry example: name "add_database_entry", parameters {type:object, properties:{database_id:{type:string}, task:{type:string}, status:{type:string}}, required:[database_id,task,status]}, ' +
        'request {method:"POST", path:"/v1/pages", body:{parent:{database_id:"{database_id}"}, properties:{Name:{title:[{text:{content:"{task}"}}]}, Status:{select:{name:"{status}"}}}}}. ' +
        `Available providers: ${[...providerMap.keys()].join(', ') || 'none'}.`,
      parameters: {
        type: 'object',
        properties: {
          provider: { type: 'string', description: 'connected service key, e.g. "notion"' },
          name: { type: 'string', description: 'snake_case tool name' },
          description: { type: 'string', description: 'what the tool does' },
          parameters: { type: 'object', description: 'JSON-schema object describing the tool args' },
          request: { type: 'object', description: 'template {method, path, body} with {placeholders}' },
        },
        required: ['provider', 'name', 'description', 'parameters', 'request'],
      },
    }

    yield { type: 'workflow.started', workflowId }

    const messages: LLMMessage[] = snapshot.messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      content: m.content,
    }))

    // Capability context drawn from each generic connector's registry metadata.
    // Tells the agent which paths actually work and what the API cannot do.
    const capabilityContext = buildConnectorCapabilityContext(extraConnectors)

    const systemPrompt =
      (agentSystemPrompt ? agentSystemPrompt + '\n\n' : '') +
      'You have optional external tools available via connectors. ' +
      'For general knowledge, math, coding, writing, or any question answerable without external data — answer DIRECTLY without calling any tool. ' +
      'ONLY call a connector tool when the user is explicitly asking to read/write data in a connected external service (e.g. "get my Kaggle datasets", "post to Notion").\n\n' +

      // Inject per-connector real endpoint knowledge.
      (capabilityContext
        ? 'CONNECTOR KNOWLEDGE (verified endpoints and limitations):\n' + capabilityContext + '\n\n'
        : '') +

      // Core decision rules.
      'RULES:\n' +
      '1. RESPECT LIMITATIONS: if a connector\'s limitations say an operation is not supported, ' +
      'tell the user honestly instead of attempting it.\n' +
      '2. USE KNOWN ENDPOINTS: prefer the listed "Available operations" paths — they are verified to work. ' +
      'For operations not listed, use the call_{provider}_api tool with a conservative GET to explore first, ' +
      'then proceed only if the endpoint exists.\n' +
      '3. MISSING CAPABILITY PATH: if the request needs an operation that none of the existing tools covers ' +
      `but a listed or probed endpoint can support it, call ${META} to save a reusable tool template, ` +
      'then immediately call the new tool to complete the task.\n' +
      '4. CHAIN CALLS: for multi-step tasks, chain tool calls — pass IDs from one response into the next.\n' +
      '5. HONEST ERRORS: if a tool call returns a 404 or 403, do not retry the same path. ' +
      'Try an alternative from the known operations list, or explain to the user what the API supports.\n' +
      'When you have enough information, reply with a clear final answer.'

    let finalAnswer = ''
    try {
      yield { type: 'step.started', stepId: 'discover', stepName: 'Discover connector tools', tool: 'mcp' }
      const connectorTools = await session.discover()
      const tools: ToolDefinition[] = [...connectorTools, ...dynamicDefs(), metaDef]
      yield {
        type: 'step.output',
        stepId: 'discover',
        chunk: `${tools.length} tool(s) available (incl. ${dynamicTools.length} custom + define_connector_function)`,
      }
      yield { type: 'step.completed', stepId: 'discover', result: {} }

      // Resolve a tool call to its handler: meta-tool, dynamic tool, or connector tool.
      const runToolCall = async (toolName: string, toolArgs: Record<string, unknown>): Promise<{ label: string; result: unknown }> => {
        if (toolName === META) {
          const def: DynamicTool = {
            provider: toolArgs.provider as DynamicTool['provider'],
            name: String(toolArgs.name),
            description: String(toolArgs.description),
            parameters: toolArgs.parameters as DynamicTool['parameters'],
            request: toolArgs.request as DynamicTool['request'],
          }
          if (!providerMap.has(def.provider)) throw new Error(`Unknown/unconnected provider: ${def.provider}`)
          await addDynamicTool(tenantId, userId, def)
          dynamicTools = [...dynamicTools.filter((t) => t.name !== def.name), def]
          tools.push({ name: def.name, description: `[${def.provider} · custom] ${def.description}`, parameters: def.parameters })
          return { label: `define_connector_function(${def.name})`, result: { created: def.name } }
        }
        const dyn = dynamicTools.find((d) => d.name === toolName)
        if (dyn) {
          const conn = providerMap.get(dyn.provider)
          if (!conn?.rawRequest) throw new Error(`Connector for ${dyn.provider} cannot run dynamic tools`)
          const path = String(fillTemplate(dyn.request.path, toolArgs))
          const body = dyn.request.body !== undefined ? fillTemplate(dyn.request.body, toolArgs) : undefined
          return { label: `${dyn.provider} · ${dyn.name}`, result: await conn.rawRequest(dyn.request.method, path, body) }
        }
        return { label: session.prettyName(toolName), result: await session.call(toolName, toolArgs) }
      }

      for (let iter = 0; iter < MAX_ITERS; iter++) {
        const stepId = `reason-${iter}`
        yield { type: 'step.started', stepId, stepName: 'Reasoning', tool: 'llm.generate' }
        const resp = await llm.generate({
          model,
          userId,
          systemPrompt,
          messages,
          tools: tools.length ? tools : undefined,
          temperature: 0.3,
        })
        if (resp.content) finalAnswer = resp.content
        yield { type: 'step.completed', stepId, result: { content: resp.content } }

        if (!resp.toolCalls || resp.toolCalls.length === 0) break

        for (const tc of resp.toolCalls) {
          const tStep = `tool-${tc.id}`
          const isMeta = tc.name === META
          yield { type: 'step.started', stepId: tStep, stepName: isMeta ? 'Define new function' : tc.name, tool: 'mcp' }
          try {
            const { label, result } = await runToolCall(tc.name, tc.arguments)
            const resultStr = typeof result === 'string' ? result : JSON.stringify(result)
            yield { type: 'step.output', stepId: tStep, chunk: `${label}\nargs: ${JSON.stringify(tc.arguments).slice(0, 1500)}\n→ ${resultStr.slice(0, 3000)}` }
            yield { type: 'step.completed', stepId: tStep, result: {} }
            messages.push({ role: 'model', content: `Called ${label}(${JSON.stringify(tc.arguments)})` })
            messages.push({ role: 'user', content: `TOOL RESULT (${label}): ${resultStr.slice(0, 6000)}` })
          } catch (err) {
            const msg = (err as Error).message
            yield { type: 'step.failed', stepId: tStep, error: msg, willRetry: false }
            messages.push({ role: 'user', content: `TOOL ERROR (${tc.name}): ${msg}` })
          }
        }
      }

      if (!finalAnswer) finalAnswer = 'I could not produce a final answer from the tool results.'
      yield { type: 'workflow.completed', workflowId, result: { content: finalAnswer } }
    } catch (err) {
      yield { type: 'workflow.failed', workflowId, error: (err as Error).message }
    } finally {
      await session.close()
      if (finalAnswer) {
        await this.contextService.appendAssistantMessage(conversationId, tenantId, finalAnswer).catch(() => {})
      }
    }
  }
}

export const agentOrchestrator = new AgentOrchestrator()
