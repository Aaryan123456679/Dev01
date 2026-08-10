import { z } from 'zod'

// ── Categories ────────────────────────────────────────────────────────────────

export type MCPCategory =
  | 'llm'
  | 'vision'
  | 'speech'
  | 'ocr'
  | 'embeddings'
  | 'storage'
  | 'sandbox'
  | 'media'
  | 'download'
  | 'file'

// ── Tool definition ───────────────────────────────────────────────────────────

export interface MCPCapability {
  name: string
  version: string
  description: string
  inputSchema: z.ZodType<unknown>
  outputSchema?: z.ZodType<unknown>
}

export interface MCPTool {
  name: string            // e.g. "llm.generate"
  description: string
  category: MCPCategory
  version: string
  inputSchema: z.ZodType<unknown>
}

// ── Execution context ─────────────────────────────────────────────────────────

export interface MCPContext {
  tenantId: string
  userId: string
  role: string
  sandboxId?: string
  workflowId?: string
}

// ── Provider interface ────────────────────────────────────────────────────────

export interface MCPProvider {
  readonly name: string
  readonly category: MCPCategory
  readonly version: string

  tools(): MCPTool[]
  execute(toolName: string, input: unknown, ctx: MCPContext): Promise<unknown>
}

// ── Errors ────────────────────────────────────────────────────────────────────

export class MCPExecutionError extends Error {
  constructor(
    message: string,
    public readonly toolName: string,
    public readonly cause?: Error,
  ) {
    super(message)
    this.name = 'MCPExecutionError'
  }
}

export class MCPProviderNotFoundError extends Error {
  constructor(category: string) {
    super(`No active MCP provider found for category: ${category}`)
    this.name = 'MCPProviderNotFoundError'
  }
}

export class MCPToolNotFoundError extends Error {
  constructor(toolName: string) {
    super(`MCP tool not found: ${toolName}`)
    this.name = 'MCPToolNotFoundError'
  }
}

export class MCPValidationError extends Error {
  constructor(toolName: string, details: string) {
    super(`Validation failed for tool '${toolName}': ${details}`)
    this.name = 'MCPValidationError'
  }
}
