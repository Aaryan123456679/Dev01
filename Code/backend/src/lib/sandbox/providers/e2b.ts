import { Sandbox } from '@e2b/code-interpreter'
import { ProviderError } from '../../../types/common'
import type { SandboxProvider, SandboxProviderConfig, ExecResult } from '../types'

export class E2BSandboxProvider implements SandboxProvider {
  readonly name = 'e2b'

  async create(config: SandboxProviderConfig): Promise<{ providerSandboxId: string }> {
    const apiKey = process.env.E2B_API_KEY
    if (!apiKey) throw new ProviderError('E2B_API_KEY is required')

    try {
      const sandbox = await Sandbox.create({
        apiKey,
        timeoutMs: config.timeoutSeconds * 1000,
      })
      return { providerSandboxId: sandbox.sandboxId }
    } catch (err) {
      throw new ProviderError(`E2B sandbox creation failed: ${(err as Error).message}`)
    }
  }

  async execute(
    providerSandboxId: string,
    command: string,
    timeoutSeconds = 30,
  ): Promise<ExecResult> {
    const apiKey = process.env.E2B_API_KEY!
    try {
      const sandbox = await Sandbox.connect(providerSandboxId, { apiKey })
      const execution = await sandbox.runCode(command, {
        timeoutMs: timeoutSeconds * 1000,
      })

      let stdout = (execution.logs?.stdout ?? []).join('\n')
      // If print() output didn't land in logs, fall back to the cell's text /
      // result values so we never silently report "(no output)".
      if (!stdout.trim()) {
        const resultText = (execution.results ?? [])
          .map((r: { text?: string }) => r.text ?? '')
          .filter(Boolean)
          .join('\n')
        stdout = (execution.text ?? '') || resultText
      }

      // E2B reports runtime errors (incl. timeouts / blocked input()) on
      // execution.error, NOT in logs.stderr — fold it in so failures surface.
      let stderr = (execution.logs?.stderr ?? []).join('')
      if (execution.error) {
        const e = execution.error as { name?: string; value?: string; traceback?: string }
        const errText = e.traceback || `${e.name ?? 'Error'}: ${e.value ?? ''}`
        stderr = [stderr, errText].filter(Boolean).join('\n')
      }
      const exitCode = execution.error ? 1 : 0

      return { stdout, stderr, exitCode }
    } catch (err) {
      throw new ProviderError(`E2B execute failed: ${(err as Error).message}`)
    }
  }

  // Run a shell command (used to compile/run code in any language).
  async runCommand(providerSandboxId: string, command: string, timeoutSeconds = 120): Promise<ExecResult> {
    const apiKey = process.env.E2B_API_KEY!
    const sandbox = await Sandbox.connect(providerSandboxId, { apiKey })
    try {
      const r = await sandbox.commands.run(command, { timeoutMs: timeoutSeconds * 1000 })
      return { stdout: r.stdout ?? '', stderr: r.stderr ?? '', exitCode: r.exitCode ?? 0 }
    } catch (err) {
      // Non-zero exit throws CommandExitError, which still carries the output.
      const e = err as { exitCode?: number; stdout?: string; stderr?: string; message?: string }
      if (typeof e.exitCode === 'number') {
        return { stdout: e.stdout ?? '', stderr: e.stderr ?? e.message ?? '', exitCode: e.exitCode }
      }
      throw new ProviderError(`E2B command failed: ${(err as Error).message}`)
    }
  }

  async writeFile(providerSandboxId: string, path: string, content: string): Promise<void> {
    const apiKey = process.env.E2B_API_KEY!
    try {
      const sandbox = await Sandbox.connect(providerSandboxId, { apiKey })
      await sandbox.files.write(path, content)
    } catch (err) {
      throw new ProviderError(`E2B writeFile failed: ${(err as Error).message}`)
    }
  }

  async writeFileBytes(providerSandboxId: string, path: string, data: Uint8Array): Promise<void> {
    const apiKey = process.env.E2B_API_KEY!
    try {
      const sandbox = await Sandbox.connect(providerSandboxId, { apiKey })
      const ab = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
      await sandbox.files.write(path, ab)
    } catch (err) {
      throw new ProviderError(`E2B writeFileBytes failed: ${(err as Error).message}`)
    }
  }

  async readFile(providerSandboxId: string, path: string): Promise<string> {
    const apiKey = process.env.E2B_API_KEY!
    try {
      const sandbox = await Sandbox.connect(providerSandboxId, { apiKey })
      const content = await sandbox.files.read(path)
      return content
    } catch (err) {
      throw new ProviderError(`E2B readFile failed: ${(err as Error).message}`)
    }
  }

  async listFiles(providerSandboxId: string, path = '/'): Promise<string[]> {
    const apiKey = process.env.E2B_API_KEY!
    try {
      const sandbox = await Sandbox.connect(providerSandboxId, { apiKey })
      const entries = await sandbox.files.list(path)
      return entries.map((e) => e.path)
    } catch (err) {
      throw new ProviderError(`E2B listFiles failed: ${(err as Error).message}`)
    }
  }

  async close(providerSandboxId: string): Promise<void> {
    const apiKey = process.env.E2B_API_KEY!
    try {
      const sandbox = await Sandbox.connect(providerSandboxId, { apiKey })
      await sandbox.kill()
    } catch {
      // Best-effort close; sandbox may already be terminated
    }
  }
}
