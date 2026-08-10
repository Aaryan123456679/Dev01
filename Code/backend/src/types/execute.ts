import { z } from 'zod'

const JsonSchemaObject = z.object({
  type: z.literal('object'),
  properties: z.record(z.unknown()),
  required: z.array(z.string()).optional(),
})

export const HttpAdjacentToolSchema = z.object({
  name: z.string().min(1).max(64),
  description: z.string().max(500),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
  path: z.string(),
  query: z.array(z.string()).optional(),
  parameters: JsonSchemaObject,
})

export const ConnectorConfigSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(80),
  kind: z.enum(['mcp-http', 'http']),
  headers: z.record(z.string()).optional(),
  url: z.string().url().optional(),
  baseUrl: z.string().url().optional(),
  tools: z.array(HttpAdjacentToolSchema).optional(),
})

export const ExecuteRequestSchema = z.object({
  prompt: z.string().min(1).max(32_000),
  conversationId: z.string().uuid().optional(),
  stream: z.boolean().default(true),
  attachmentIds: z.array(z.string().uuid()).max(10).optional(),
  // When true, skip intent classification and always run the code-execution
  // workflow in a sandbox (the explicit "Run in sandbox" button).
  forceCodeExecution: z.boolean().optional(),
  // Selected model (model switcher). Validated against the catalog server-side.
  model: z.string().optional(),
  // Optional custom-agent persona that overrides the default system prompt.
  agentSystemPrompt: z.string().max(8_000).optional(),
  // Active MCP / MCP-adjacent connectors for this turn (agentic tool calling).
  connectors: z.array(ConnectorConfigSchema).max(10).optional(),
})

export type ExecuteRequest = z.infer<typeof ExecuteRequestSchema>
