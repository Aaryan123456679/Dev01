import { McpHttpConnector } from './mcpClient'
import { HttpAdjacentConnector } from './httpAdjacent'
import { ConnectorError } from './types'
import type { Connector, ConnectorConfig, ConnectorToolDef } from './types'
import type { ToolDefinition } from '../../llm/types'

export function buildConnector(config: ConnectorConfig): Connector {
  switch (config.kind) {
    case 'mcp-http':
      return new McpHttpConnector(config)
    case 'http':
      return new HttpAdjacentConnector(config)
    default:
      throw new ConnectorError(`Unknown connector kind: ${(config as ConnectorConfig).kind}`)
  }
}

interface Routed {
  connector: Connector
  originalName: string
  def: ConnectorToolDef
}

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48)
}

// A per-request session over a set of connectors. It discovers tools from every
// connector, exposes them to the LLM with collision-safe namespaced names, and
// routes tool calls back to the owning connector.
export class ConnectorSession {
  private connectors: Connector[]
  private routes = new Map<string, Routed>()
  private discovered = false

  constructor(configs: ConnectorConfig[], extra: Connector[] = []) {
    this.connectors = [...extra, ...configs.map(buildConnector)]
  }

  get isEmpty(): boolean {
    return this.connectors.length === 0
  }

  // Discover tools across all connectors and produce LLM tool definitions.
  async discover(): Promise<ToolDefinition[]> {
    const defs: ToolDefinition[] = []
    for (let i = 0; i < this.connectors.length; i++) {
      const connector = this.connectors[i]!
      let tools: ConnectorToolDef[] = []
      try {
        tools = await connector.listTools()
      } catch (err) {
        // A broken connector shouldn't kill the whole turn.
        continue
      }
      for (const t of tools) {
        const exposed = `c${i}_${sanitize(t.name)}`
        this.routes.set(exposed, { connector, originalName: t.name, def: t })
        defs.push({
          name: exposed,
          description: `[${connector.config.name}] ${t.description}`,
          parameters: t.parameters,
        })
      }
    }
    this.discovered = true
    return defs
  }

  hasTools(): boolean {
    return this.routes.size > 0
  }

  // List discovered tools for inspection (connector + original name).
  toolList(): Array<{ connector: string; name: string; description: string }> {
    return Array.from(this.routes.values()).map((r) => ({
      connector: r.connector.config.name,
      name: r.originalName,
      description: r.def.description,
    }))
  }

  async call(exposedName: string, args: Record<string, unknown>): Promise<unknown> {
    const route = this.routes.get(exposedName)
    if (!route) throw new ConnectorError(`Unknown tool: ${exposedName}`)
    return route.connector.callTool(route.originalName, args)
  }

  prettyName(exposedName: string): string {
    const route = this.routes.get(exposedName)
    return route ? `${route.connector.config.name} · ${route.originalName}` : exposedName
  }

  async close(): Promise<void> {
    await Promise.all(this.connectors.map((c) => c.close().catch(() => {})))
  }
}
