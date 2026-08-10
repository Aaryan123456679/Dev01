import { IntegrationRepo, type IntegrationProvider } from '../../repositories/integration.repo'
import type { JsonSchemaObject } from '../mcp/connectors/types'

// A dynamically-defined connector function. It is a named, parameterised request
// template bound to a provider, stored in the user's connection metadata (NOT in
// the codebase). At call time the template placeholders ({arg}) are filled from
// the call arguments and executed via the connector's rawRequest — so this is a
// generalised mechanism that works for ANY HTTP/REST-style MCP connector.
export interface DynamicTool {
  provider: IntegrationProvider
  name: string
  description: string
  parameters: JsonSchemaObject
  request: { method: string; path: string; body?: unknown }
}

const repo = new IntegrationRepo()

export async function getDynamicTools(tenantId: string, userId: string): Promise<DynamicTool[]> {
  try {
    const conns = await repo.listByUser(tenantId, userId)
    const tools: DynamicTool[] = []
    for (const c of conns) {
      const list = (c.metadata as { dynamicTools?: DynamicTool[] })?.dynamicTools
      if (Array.isArray(list)) tools.push(...list)
    }
    return tools
  } catch {
    return []
  }
}

export async function addDynamicTool(tenantId: string, userId: string, tool: DynamicTool): Promise<void> {
  const conns = await repo.listByUser(tenantId, userId)
  const conn = conns.find((c) => c.provider === tool.provider)
  if (!conn) throw new Error(`No ${tool.provider} connection — connect it before defining tools for it`)
  const existing = ((conn.metadata as { dynamicTools?: DynamicTool[] })?.dynamicTools ?? []).filter(
    (t) => t.name !== tool.name,
  )
  existing.push(tool)
  await repo.mergeMetadata(tenantId, userId, tool.provider, { dynamicTools: existing })
}

// Deep-substitute {placeholders} in a template (strings, objects, arrays) using
// the provided args.
export function fillTemplate(template: unknown, args: Record<string, unknown>): unknown {
  if (typeof template === 'string') {
    // Whole-string placeholder → keep the arg's native type.
    const whole = template.match(/^\{(\w+)\}$/)
    if (whole) return args[whole[1]]
    return template.replace(/\{(\w+)\}/g, (_, k) => (args[k] === undefined ? '' : String(args[k])))
  }
  if (Array.isArray(template)) return template.map((t) => fillTemplate(t, args))
  if (template && typeof template === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(template)) out[k] = fillTemplate(v, args)
    return out
  }
  return template
}
