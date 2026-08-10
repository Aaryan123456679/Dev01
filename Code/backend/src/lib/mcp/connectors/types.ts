// External integrations exposed to the agent as MCP-style tools.
//
//  - kind 'mcp-http': a REAL Model Context Protocol server reached over the
//    Streamable HTTP transport (with SSE fallback). Tools are discovered live.
//  - kind 'http': "MCP-adjacent" — any plain REST API described by a small
//    manifest, presented through the exact same tool interface so apps that do
//    not natively speak MCP still behave like MCP to the rest of the system.

export type ConnectorKind = 'mcp-http' | 'http'

export interface JsonSchemaObject {
  type: 'object'
  properties: Record<string, unknown>
  required?: string[]
}

export interface ConnectorToolDef {
  name: string
  description: string
  parameters: JsonSchemaObject
}

export interface HttpAdjacentTool {
  name: string
  description: string
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  // Path relative to baseUrl; may contain {placeholders} filled from args.
  path: string
  // Which argument names map to the query string. Remaining args go to the JSON
  // body for write methods. Path placeholders are consumed first.
  query?: string[]
  parameters: JsonSchemaObject
}

export interface ConnectorConfig {
  id: string
  name: string
  kind: ConnectorKind
  headers?: Record<string, string>
  // mcp-http
  url?: string
  // http (MCP-adjacent)
  baseUrl?: string
  tools?: HttpAdjacentTool[]
}

export interface Connector {
  readonly config: ConnectorConfig
  listTools(): Promise<ConnectorToolDef[]>
  callTool(name: string, args: Record<string, unknown>): Promise<unknown>
  close(): Promise<void>
  // Optional generic request capability. Connectors that expose this (any
  // HTTP/REST-style integration) can host dynamically-defined tools — the agent
  // can invent new functions at runtime that are executed via rawRequest.
  rawRequest?(method: string, path: string, body?: unknown): Promise<unknown>
  // Stable provider key used to bind dynamic tools to this connector.
  readonly provider?: string
}

export class ConnectorError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConnectorError'
  }
}
