import { ConnectorError } from './types'
import type { Connector, ConnectorConfig, ConnectorToolDef, JsonSchemaObject } from './types'

// Connector backed by a real MCP server over Streamable HTTP (preferred) with
// an automatic fallback to the legacy SSE transport. Uses the official MCP SDK.
export class McpHttpConnector implements Connector {
  private client: any | null = null

  constructor(public readonly config: ConnectorConfig) {}

  private async ensureConnected(): Promise<void> {
    if (this.client) return
    if (!this.config.url) throw new ConnectorError(`Connector '${this.config.name}' is missing a url`)

    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js')
    const url = new URL(this.config.url)
    const headers = this.config.headers ?? {}

    // Try Streamable HTTP first.
    try {
      const { StreamableHTTPClientTransport } = await import(
        '@modelcontextprotocol/sdk/client/streamableHttp.js'
      )
      const client = new Client({ name: 'Dev01', version: '1.0.0' }, { capabilities: {} })
      const transport = new StreamableHTTPClientTransport(url, { requestInit: { headers } })
      await client.connect(transport)
      this.client = client
      return
    } catch (httpErr) {
      // Fallback to SSE for servers that only speak the older transport.
      try {
        const { SSEClientTransport } = await import('@modelcontextprotocol/sdk/client/sse.js')
        const client = new Client({ name: 'Dev01', version: '1.0.0' }, { capabilities: {} })
        const transport = new SSEClientTransport(url, { requestInit: { headers } })
        await client.connect(transport)
        this.client = client
        return
      } catch (sseErr) {
        throw new ConnectorError(
          `Could not connect to MCP server '${this.config.name}': ${(httpErr as Error).message}`,
        )
      }
    }
  }

  async listTools(): Promise<ConnectorToolDef[]> {
    await this.ensureConnected()
    const res = await this.client!.listTools()
    return (res.tools ?? []).map((t: any) => ({
      name: t.name,
      description: t.description ?? '',
      parameters: normalizeSchema(t.inputSchema),
    }))
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    await this.ensureConnected()
    const res = await this.client!.callTool({ name, arguments: args })
    // MCP returns { content: [{type:'text', text}, ...], isError? }
    if (Array.isArray(res?.content)) {
      const text = res.content
        .filter((c: any) => c.type === 'text')
        .map((c: any) => c.text)
        .join('\n')
      if (res.isError) throw new ConnectorError(text || 'MCP tool reported an error')
      return text || res.content
    }
    return res
  }

  async close(): Promise<void> {
    try {
      await this.client?.close()
    } catch {
      /* ignore */
    }
    this.client = null
  }
}

function normalizeSchema(schema: unknown): JsonSchemaObject {
  if (schema && typeof schema === 'object' && (schema as any).type === 'object') {
    const s = schema as any
    return { type: 'object', properties: s.properties ?? {}, required: s.required ?? [] }
  }
  return { type: 'object', properties: {} }
}
