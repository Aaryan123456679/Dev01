// GenericRestConnector
//
// A universal Connector implementation for any REST API described by a
// ConnectorRegistryEntry. It provides:
//
//   rawRequest  — authenticated HTTP call (used by define_connector_function)
//   listTools   — one built-in exploration tool: call_{provider}_api
//                 (analogous to notion_api_request; lets the agent probe the API
//                 before committing to defined tool templates)
//
// The connector's registry entry carries `discovery_metadata.common_operations`
// (real, verified endpoint paths) and `discovery_metadata.api_limitations`
// (operations the API does NOT support). Both are injected into the tool
// description so the agent can act on accurate information.

import { ConnectorError } from './types'
import type { Connector, ConnectorConfig, ConnectorToolDef } from './types'
import type { ConnectorRegistryEntry } from '../../../repositories/connectorRegistry.repo'

interface CommonOperation {
  name: string
  method: string
  path: string
  description: string
  path_params?: string[]
}

export class GenericRestConnector implements Connector {
  readonly config: ConnectorConfig
  readonly provider: string

  // Built-in tool name — constructed from the provider so there is no collision
  // between connectors (e.g. call_figma_api vs call_medium_api).
  private readonly builtinToolName: string

  constructor(
    readonly entry: ConnectorRegistryEntry,
    // All credentials keyed by their registry name (e.g. { access_key: "...", secret_key: "..." }).
    // Passing a plain string is also accepted for backwards-compat — treated as the primary token.
    private readonly credentials: Record<string, string> | string,
    accountLabel?: string,
  ) {
    this.provider = entry.normalized_name
    this.builtinToolName = `call_${entry.normalized_name}_api`
    this.config = {
      id: entry.normalized_name,
      name: accountLabel ? `${entry.display_name} (${accountLabel})` : entry.display_name,
      kind: 'mcp-http',
    }
  }

  // The primary auth token: first required_credential by name, falling back to
  // the first value in the credentials map (or the string itself for compat).
  private primaryToken(): string {
    if (typeof this.credentials === 'string') return this.credentials
    const primaryName = (this.entry.required_credentials[0] as { name?: string } | undefined)?.name
    if (primaryName && this.credentials[primaryName] !== undefined) return this.credentials[primaryName]
    const first = Object.values(this.credentials)[0]
    return first ?? ''
  }

  // Build the Authorization/key header from the stored auth scheme.
  // For basic auth: combines the first two credentials as username:password, base64-encodes them.
  // For all other schemes: replaces {token} in auth_header_format with the primary credential.
  private authHeaders(): Record<string, string> {
    // Always merge required_headers from discovery_metadata first.
    const extra = (this.entry.discovery_metadata as Record<string, unknown>)?.required_headers
    const extraHeaders: Record<string, string> =
      extra && typeof extra === 'object' && !Array.isArray(extra)
        ? (extra as Record<string, string>)
        : {}

    if (!this.entry.auth_header_name) {
      return { ...extraHeaders, 'Content-Type': 'application/json' }
    }

    let headerValue: string

    if (this.entry.auth_type === 'basic') {
      const credsMap = typeof this.credentials === 'string' ? {} : this.credentials
      // Use required_credentials order so username always comes before password,
      // regardless of which order the user happened to fill the form.
      const firstName = this.entry.required_credentials[0]?.name
      const secondName = this.entry.required_credentials[1]?.name
      const username = (firstName && credsMap[firstName]) ?? Object.values(credsMap)[0] ?? (typeof this.credentials === 'string' ? this.credentials : '')
      const password = (secondName && credsMap[secondName]) ?? Object.values(credsMap)[1] ?? ''
      const encoded = Buffer.from(`${username}:${password}`).toString('base64')
      headerValue = `Basic ${encoded}`
    } else {
      const format = this.entry.auth_header_format ?? '{token}'
      headerValue = format.replace('{token}', this.primaryToken())
    }

    return {
      ...extraHeaders,
      [this.entry.auth_header_name]: headerValue,
      'Content-Type': 'application/json',
    }
  }

  // Generic authenticated call — the foundation for every dynamic tool.
  // On 404 we include a hint that guides the agent to probe valid endpoints.
  async rawRequest(method: string, path: string, body?: unknown): Promise<unknown> {
    const baseUrl = this.entry.base_url ?? ''
    if (!baseUrl) throw new ConnectorError(`${this.entry.display_name} connector has no base URL`)

    const m = method.trim().toUpperCase()
    if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(m)) {
      throw new ConnectorError(`Unsupported HTTP method: ${m}`)
    }

    // If base_url already ends with a path prefix (e.g. /v1) and the supplied
    // path duplicates it (e.g. /v1/search), strip the duplicate to avoid
    // double-prefixing (https://api.notion.com/v1/v1/search → 400).
    let normalizedPath = path
    if (!path.startsWith('http')) {
      try {
        const base = new URL(baseUrl)
        const baseSuffix = base.pathname.replace(/\/$/, '') // e.g. "/v1"
        if (baseSuffix && normalizedPath.startsWith(baseSuffix + '/')) {
          normalizedPath = normalizedPath.slice(baseSuffix.length)
        }
      } catch { /* invalid base URL — leave path as-is */ }
    }

    // Accept absolute URLs (for pagination / next-page links) or relative paths.
    const url = normalizedPath.startsWith('http')
      ? normalizedPath
      : `${baseUrl.replace(/\/$/, '')}${normalizedPath.startsWith('/') ? '' : '/'}${normalizedPath}`

    const res = await fetch(url, {
      method: m,
      headers: this.authHeaders(),
      body: m === 'GET' || m === 'DELETE' ? undefined : JSON.stringify(body ?? {}),
    })

    const text = await res.text()
    let json: unknown
    try { json = JSON.parse(text) } catch { json = { raw: text } }

    if (!res.ok) {
      const apiMsg = (json as Record<string, unknown>)?.message
        ?? (json as Record<string, unknown>)?.error
        ?? (json as Record<string, unknown>)?.err
        ?? text.slice(0, 400)

      // On 404: give the agent actionable guidance rather than a bare error.
      if (res.status === 404) {
        const meta = this.entry.discovery_metadata as Record<string, unknown>
        const ops: CommonOperation[] = Array.isArray(meta?.common_operations) ? meta.common_operations as CommonOperation[] : []
        const examples = ops.length
          ? `\nKnown working paths: ${ops.map((o) => `${o.method} ${o.path}`).join(', ')}.`
          : `\nUse ${this.builtinToolName} with a simple GET (e.g. /me or /user) to probe valid endpoints.`
        throw new ConnectorError(
          `${this.entry.display_name} ${m} ${path} → 404 Not Found. ` +
          `The path may not exist or the resource requires a specific ID. ${examples} ` +
          `Check the API docs at ${this.entry.documentation_url ?? 'the official site'}.`,
        )
      }

      // On 403/401: token / scope issue.
      if (res.status === 403 || res.status === 401) {
        throw new ConnectorError(
          `${this.entry.display_name} ${m} ${path} → ${res.status} Unauthorized/Forbidden. ` +
          `Verify the token has the required scopes. ${apiMsg}`,
        )
      }

      throw new ConnectorError(`${this.entry.display_name} ${m} ${path} failed (${res.status}): ${apiMsg}`)
    }

    return json
  }

  // The built-in tool lets the agent probe or call the API for one-off requests
  // (exploration, verification, or operations that don't justify a saved template).
  async listTools(): Promise<ConnectorToolDef[]> {
    const meta = this.entry.discovery_metadata as Record<string, unknown>
    const ops: CommonOperation[] = Array.isArray(meta?.common_operations) ? meta.common_operations as CommonOperation[] : []
    const limitations: string[] = Array.isArray(meta?.api_limitations) ? meta.api_limitations as string[] : []

    const opsText = ops.length
      ? `\n\nKnown working endpoints:\n${ops.map((o) => `  ${o.method} ${o.path}${o.description ? ` — ${o.description}` : ''}`).join('\n')}`
      : ''
    const limText = limitations.length
      ? `\n\nAPI limitations (do NOT attempt these):\n${limitations.map((l) => `  • ${l}`).join('\n')}`
      : ''

    return [
      {
        name: this.builtinToolName,
        description:
          `Make any authenticated request to the ${this.entry.display_name} REST API. ` +
          `Base URL: ${this.entry.base_url ?? '(see documentation)'}. ` +
          `Use this for exploration, one-off calls, or when no saved tool covers the operation. ` +
          `For recurring operations, prefer define_connector_function to save a reusable template.` +
          opsText +
          limText,
        parameters: {
          type: 'object',
          properties: {
            method: { type: 'string', description: 'HTTP method: GET | POST | PUT | PATCH | DELETE' },
            path: {
              type: 'string',
              description:
                'Path relative to the base URL (e.g. "/me" or "/files/{file_key}"). ' +
                'Use a simple GET like /me first if you are unsure what paths exist.',
            },
            body: { type: 'object', description: 'Request body for POST/PUT/PATCH (optional)' },
          },
          required: ['method', 'path'],
        },
      },
    ]
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    if (name === this.builtinToolName) {
      const method = String(args.method ?? 'GET')
      const path = String(args.path ?? '/')
      return this.rawRequest(method, path, args.body)
    }
    throw new ConnectorError(
      `${this.entry.display_name}: unknown tool "${name}". ` +
      `Use ${this.builtinToolName} for ad-hoc calls, or define_connector_function to create reusable tools.`,
    )
  }

  async close(): Promise<void> {
    // Stateless (per-request fetch).
  }
}
