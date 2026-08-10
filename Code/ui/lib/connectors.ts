'use client'

// Client-side store for MCP / MCP-adjacent connector definitions. Configs live
// in localStorage (per browser) and are sent to the backend per chat turn; the
// backend connects transiently and runs the agentic tool-calling loop.

export type ConnectorKind = 'mcp-http' | 'http'

export interface HttpAdjacentTool {
  name: string
  description: string
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  path: string
  query?: string[]
  parameters: { type: 'object'; properties: Record<string, unknown>; required?: string[] }
}

export interface ConnectorConfig {
  id: string
  name: string
  kind: ConnectorKind
  headers?: Record<string, string>
  url?: string
  baseUrl?: string
  tools?: HttpAdjacentTool[]
}

const STORE = 'connectors'
const ACTIVE = 'activeConnectors'

export const BUILTIN_CONNECTORS: ConnectorConfig[] = [
  { id: 'builtin-apple-notes', name: 'Apple Notes', kind: 'mcp-http', url: 'http://localhost:7900/mcp' },
]
const DEFAULT_ACTIVE_IDS: string[] = []

export function isBuiltin(id: string): boolean {
  return BUILTIN_CONNECTORS.some((c) => c.id === id)
}

export function getConnectors(): ConnectorConfig[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(STORE) ?? '[]') } catch { return [] }
}

// Built-in + user-defined connectors.
export function getAllConnectors(): ConnectorConfig[] {
  return [...BUILTIN_CONNECTORS, ...getConnectors()]
}

export function saveConnector(cfg: ConnectorConfig): void {
  const all = getConnectors()
  const i = all.findIndex((c) => c.id === cfg.id)
  if (i >= 0) all[i] = cfg
  else all.push(cfg)
  localStorage.setItem(STORE, JSON.stringify(all))
  window.dispatchEvent(new Event('connectors-changed'))
}

export function deleteConnector(id: string): void {
  localStorage.setItem(STORE, JSON.stringify(getConnectors().filter((c) => c.id !== id)))
  setActiveIds(getActiveIds().filter((x) => x !== id))
  window.dispatchEvent(new Event('connectors-changed'))
}

export function getActiveIds(): string[] {
  if (typeof window === 'undefined') return []
  const raw = localStorage.getItem(ACTIVE)
  // First run: seed the default-active built-ins (e.g. Apple Notes).
  if (raw === null) {
    localStorage.setItem(ACTIVE, JSON.stringify(DEFAULT_ACTIVE_IDS))
    return [...DEFAULT_ACTIVE_IDS]
  }
  try { return JSON.parse(raw) } catch { return [] }
}

export function setActiveIds(ids: string[]): void {
  localStorage.setItem(ACTIVE, JSON.stringify(ids))
  window.dispatchEvent(new Event('connectors-changed'))
}

export function getActiveConnectors(): ConnectorConfig[] {
  const active = new Set(getActiveIds())
  return getAllConnectors().filter((c) => active.has(c.id))
}

export function newConnectorId(): string {
  return `conn-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}
