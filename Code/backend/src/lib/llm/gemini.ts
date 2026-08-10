import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
  type Content,
  type Part,
  type GenerationConfig,
} from '@google/generative-ai'
import { ProviderError } from '../../types/common'
import { isValidModel, recordUsage } from './models'
import type {
  LLMProvider,
  LLMMessage,
  GenerateRequest,
  GenerateResponse,
  GenerateChunk,
  EmbeddingsRequest,
  EmbeddingsResponse,
  ToolCall,
} from './types'

const SAFETY_SETTINGS = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
]

// Gemini only accepts a subset of JSON Schema in function declarations. Strip
// unsupported keywords (e.g. $schema, additionalProperties, $ref) recursively so
// tool schemas from arbitrary MCP servers don't trigger 400s.
const GEMINI_SCHEMA_KEYS = new Set([
  'type', 'description', 'enum', 'format', 'nullable', 'properties', 'required', 'items',
])

function sanitizeGeminiSchema(schema: unknown): Record<string, unknown> {
  if (!schema || typeof schema !== 'object') return { type: 'object', properties: {} }
  const src = schema as Record<string, unknown>
  const out: Record<string, unknown> = {}

  for (const [k, v] of Object.entries(src)) {
    if (!GEMINI_SCHEMA_KEYS.has(k)) continue
    if (k === 'properties' && v && typeof v === 'object') {
      const props: Record<string, unknown> = {}
      for (const [pk, pv] of Object.entries(v as Record<string, unknown>)) {
        props[pk] = sanitizeGeminiSchema(pv)
      }
      out.properties = props
    } else if (k === 'items') {
      out.items = sanitizeGeminiSchema(v)
    } else {
      out[k] = v
    }
  }

  if (!out.type) out.type = 'object'
  // Gemini rejects object schemas that declare no properties.
  if (out.type === 'object' && (!out.properties || Object.keys(out.properties as object).length === 0)) {
    out.properties = { _noop: { type: 'string', description: 'unused' } }
  }
  return out
}

function toGeminiContent(messages: LLMMessage[]): Content[] {
  const contents: Content[] = []
  for (const msg of messages) {
    if (msg.role === 'system') continue // handled via systemInstruction
    const role = msg.role === 'model' ? 'model' : 'user'
    const part: Part = { text: msg.content }
    if (contents.length > 0 && contents[contents.length - 1]?.role === role) {
      // Merge consecutive same-role messages
      contents[contents.length - 1]!.parts.push(part)
    } else {
      contents.push({ role, parts: [part] })
    }
  }
  return contents
}

export class GeminiProvider implements LLMProvider {
  readonly name = 'gemini'
  readonly defaultModel: string
  private readonly embeddingModel: string
  private readonly client: GoogleGenerativeAI
  // Models (and aliases like "-latest", which Google silently repoints over time)
  // that reject thinkingConfig outright. Learned at runtime on first 400 rather
  // than hardcoded by name, since alias targets change without notice.
  private readonly noThinkingConfig = new Set<string>()

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) throw new Error('GEMINI_API_KEY is required')
    this.client = new GoogleGenerativeAI(apiKey)
    this.defaultModel = process.env.GEMINI_DEFAULT_MODEL ?? 'gemini-3.5-flash'
    this.embeddingModel = process.env.GEMINI_EMBEDDING_MODEL ?? 'gemini-embedding-001'
  }

  async generate(request: GenerateRequest): Promise<GenerateResponse> {
    const modelId = request.model && isValidModel(request.model) ? request.model : this.defaultModel
    const MAX_RETRIES = 3
    let lastErr: Error | undefined
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 2000 * attempt))
      const sendThinkingConfig = !modelId.includes('2.5') && !this.noThinkingConfig.has(modelId)
    try {
      const systemInstruction = request.systemPrompt
        ? { role: 'user' as const, parts: [{ text: request.systemPrompt }] }
        : undefined

      const model = this.client.getGenerativeModel({
        model: modelId,
        systemInstruction,
        safetySettings: SAFETY_SETTINGS,
        generationConfig: {
          temperature: request.temperature ?? 0.7,
          maxOutputTokens: request.maxOutputTokens ?? 8192,
          ...(sendThinkingConfig ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
        } as GenerationConfig,
      })

      const tools = request.tools?.length
        ? [
            {
              functionDeclarations: request.tools.map((t) => ({
                name: t.name,
                description: t.description,
                parameters: sanitizeGeminiSchema(t.parameters) as any,
              })),
            },
          ]
        : undefined

      const contents = toGeminiContent(request.messages)
      const result = await model.generateContent({ contents, tools })
      const response = result.response

      const candidate = response.candidates?.[0]
      if (!candidate) {
        throw new ProviderError('Gemini returned no candidates')
      }

      const toolCalls: ToolCall[] = []
      let textContent = ''

      for (const part of candidate.content?.parts ?? []) {
        // Skip thinking-token parts (Gemini 2.5+ marks them with thought:true).
        if ((part as unknown as Record<string, unknown>).thought === true) continue
        if (part.text) textContent += part.text
        if (part.functionCall) {
          toolCalls.push({
            id: `tool-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            name: part.functionCall.name,
            arguments: (part.functionCall.args ?? {}) as Record<string, unknown>,
          })
        }
      }

      const finishReason = candidate.finishReason
      const mappedReason =
        finishReason === 'STOP'
          ? 'stop'
          : finishReason === 'MAX_TOKENS'
            ? 'max_tokens'
            : toolCalls.length
              ? 'tool_use'
              : 'stop'

      recordUsage(modelId, request.userId ?? 'anonymous')
      return {
        content: textContent,
        toolCalls: toolCalls.length ? toolCalls : undefined,
        finishReason: mappedReason,
        usage: {
          inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
          outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
        },
      }
    } catch (err) {
      if (err instanceof ProviderError) throw err
      const msg = (err as Error).message
      // Some models (and "-latest" aliases, whose target Google repoints over
      // time) reject thinkingConfig with a 400. Learn that and retry once
      // without it, without spending a normal backoff attempt.
      if (sendThinkingConfig && /400|invalid argument/i.test(msg)) {
        this.noThinkingConfig.add(modelId)
        attempt--
        continue
      }
      // Retry transient errors (503 / 429 with retry delay) but fail fast on quota exhaustion.
      const isQuota = /quota|resource_exhausted/i.test(msg)
      const isTransient = /503|service unavailable|overloaded|too many requests/i.test(msg)
      if (!isQuota && isTransient && attempt < MAX_RETRIES) { lastErr = err as Error; continue }
      throw new ProviderError(`Gemini generate failed: ${msg}`)
    }
    }
    throw new ProviderError(`Gemini generate failed after retries: ${lastErr?.message}`)
  }

  async *stream(request: GenerateRequest): AsyncGenerator<GenerateChunk> {
    const modelId = request.model && isValidModel(request.model) ? request.model : this.defaultModel
    try {
      const systemInstruction = request.systemPrompt
        ? { role: 'user' as const, parts: [{ text: request.systemPrompt }] }
        : undefined
      const contents = toGeminiContent(request.messages)

      const startStream = (sendThinkingConfig: boolean) => {
        const model = this.client.getGenerativeModel({
          model: modelId,
          systemInstruction,
          safetySettings: SAFETY_SETTINGS,
          generationConfig: {
            temperature: request.temperature ?? 0.7,
            maxOutputTokens: request.maxOutputTokens ?? 8192,
            ...(sendThinkingConfig ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
          } as GenerationConfig,
        })
        return model.generateContentStream({ contents })
      }

      const sendThinkingConfig = !modelId.includes('2.5') && !this.noThinkingConfig.has(modelId)
      let streamResult: Awaited<ReturnType<typeof startStream>>
      try {
        streamResult = await startStream(sendThinkingConfig)
      } catch (err) {
        // See the comment in generate() — "-latest" aliases can start rejecting
        // thinkingConfig once Google repoints them without notice.
        if (sendThinkingConfig && /400|invalid argument/i.test((err as Error).message)) {
          this.noThinkingConfig.add(modelId)
          streamResult = await startStream(false)
        } else {
          throw err
        }
      }

      for await (const chunk of streamResult.stream) {
        const text = chunk.text()
        if (text) {
          yield { delta: text }
        }
        const finishReason = chunk.candidates?.[0]?.finishReason
        if (finishReason && finishReason !== 'STOP') {
          yield { delta: '', finishReason }
        }
      }
      recordUsage(modelId, request.userId ?? 'anonymous')
      yield { delta: '', finishReason: 'stop' }
    } catch (err) {
      throw new ProviderError(`Gemini stream failed: ${(err as Error).message}`)
    }
  }

  async embeddings(request: EmbeddingsRequest): Promise<EmbeddingsResponse> {
    try {
      const model = this.client.getGenerativeModel({
        model: request.model ?? this.embeddingModel,
      })

      const embeddings: number[][] = []
      for (const text of request.texts) {
        const result = await model.embedContent(text)
        embeddings.push(result.embedding.values)
      }

      return { embeddings, model: request.model ?? this.embeddingModel }
    } catch (err) {
      throw new ProviderError(`Gemini embeddings failed: ${(err as Error).message}`)
    }
  }
}
