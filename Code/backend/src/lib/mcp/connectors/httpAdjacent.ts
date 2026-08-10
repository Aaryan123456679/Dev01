import { ConnectorError } from './types'
import type { Connector, ConnectorConfig, ConnectorToolDef, HttpAdjacentTool } from './types'

// "MCP-adjacent" connector: wraps a plain REST API described by a manifest so it
// is callable through the same tool interface as a real MCP server. This is how
// apps that don't natively speak MCP still get MCP-like behaviour.
export class HttpAdjacentConnector implements Connector {
  constructor(public readonly config: ConnectorConfig) {}

  async listTools(): Promise<ConnectorToolDef[]> {
    return (this.config.tools ?? []).map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }))
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    const tool = (this.config.tools ?? []).find((t) => t.name === name)
    if (!tool) throw new ConnectorError(`Unknown tool '${name}' on connector '${this.config.name}'`)
    if (!this.config.baseUrl) throw new ConnectorError(`Connector '${this.config.name}' is missing baseUrl`)

    const { url, body } = this.buildRequest(tool, args)
    const init: RequestInit = {
      method: tool.method,
      headers: { 'Content-Type': 'application/json', ...(this.config.headers ?? {}) },
    }
    if (body !== undefined && tool.method !== 'GET' && tool.method !== 'DELETE') {
      init.body = JSON.stringify(body)
    }

    let res: Response
    try {
      res = await fetch(url, init)
    } catch (err) {
      throw new ConnectorError(`Request to '${name}' failed: ${(err as Error).message}`)
    }

    const text = await res.text()
    if (!res.ok) throw new ConnectorError(`Tool '${name}' returned HTTP ${res.status}: ${text.slice(0, 300)}`)
    try {
      return JSON.parse(text)
    } catch {
      return text
    }
  }

  async close(): Promise<void> {
    /* stateless */
  }

  private buildRequest(tool: HttpAdjacentTool, args: Record<string, unknown>): { url: string; body?: Record<string, unknown> } {
    const consumed = new Set<string>()

    // 1. Fill path placeholders.
    let path = tool.path.replace(/\{(\w+)\}/g, (_, key) => {
      consumed.add(key)
      return encodeURIComponent(String(args[key] ?? ''))
    })

    // 2. Query params.
    const qs = new URLSearchParams()
    for (const key of tool.query ?? []) {
      if (args[key] !== undefined) {
        consumed.add(key)
        qs.set(key, String(args[key]))
      }
    }

    const base = this.config.baseUrl!.replace(/\/$/, '')
    const query = qs.toString()
    const url = `${base}${path.startsWith('/') ? '' : '/'}${path}${query ? `?${query}` : ''}`

    // 3. Remaining args → JSON body.
    const body: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(args)) {
      if (!consumed.has(k)) body[k] = v
    }

    return { url, body: Object.keys(body).length ? body : undefined }
  }
}
