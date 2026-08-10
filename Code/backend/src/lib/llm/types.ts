// ── Tool definitions (subset of MCP tool schema) ─────────────────────────────

export interface ToolParameterSchema {
  type: string
  properties?: Record<string, unknown>
  required?: string[]
}

export interface ToolDefinition {
  name: string
  description: string
  parameters: ToolParameterSchema
}

export interface ToolCall {
  id: string
  name: string
  arguments: Record<string, unknown>
}

// ── Request / Response types ──────────────────────────────────────────────────

export type MessageRole = 'user' | 'model' | 'system' | 'tool'

export interface LLMMessage {
  role: MessageRole
  content: string
  toolCallId?: string
}

export interface GenerateRequest {
  messages: LLMMessage[]
  systemPrompt?: string
  temperature?: number
  maxOutputTokens?: number
  tools?: ToolDefinition[]
  model?: string
  userId?: string
}

export interface GenerateResponse {
  content: string
  toolCalls?: ToolCall[]
  finishReason: 'stop' | 'tool_use' | 'max_tokens' | 'error'
  usage: {
    inputTokens: number
    outputTokens: number
  }
}

export interface GenerateChunk {
  delta: string
  finishReason?: string
}

export interface EmbeddingsRequest {
  texts: string[]
  model?: string
}

export interface EmbeddingsResponse {
  embeddings: number[][]
  model: string
}

// ── Provider interface ────────────────────────────────────────────────────────

export interface LLMProvider {
  readonly name: string
  readonly defaultModel: string

  generate(request: GenerateRequest): Promise<GenerateResponse>
  stream(request: GenerateRequest): AsyncGenerator<GenerateChunk>
  embeddings(request: EmbeddingsRequest): Promise<EmbeddingsResponse>
}
