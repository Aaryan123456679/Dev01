// ConnectorDiscoveryService
//
// Given a product name ("Figma", "Medium", "Linear", …), returns a complete
// ConnectorRegistryEntry describing how to authenticate and call its REST API.
//
// Priority:
//   1. connector_registry table (cached — avoid re-discovering)
//   2. LLM reasoning (Gemini knows popular APIs from training data)
//
// The LLM output includes not just auth mechanics but ALSO a list of real
// endpoint paths the API actually supports, API limitations (what you CAN'T do),
// and a safe test endpoint. This gives the agent enough knowledge to use the
// connector without blindly guessing paths.

import { llmRegistry } from '../llm/registry'
import { ConnectorRegistryRepo, type ConnectorRegistryEntry, type UpsertRegistryInput } from '../../repositories/connectorRegistry.repo'

const registryRepo = new ConnectorRegistryRepo()

// Shape the LLM must return. common_operations gives the agent real, working
// endpoint paths so it doesn't have to guess. api_limitations prevents the
// agent from trying operations the API doesn't support.
const DISCOVERY_SYSTEM_PROMPT =
  'You are an API integration expert with deep knowledge of popular REST APIs. ' +
  'The user will provide a product name. ' +
  'Respond with ONLY a single valid JSON object (no markdown, no explanation, no prose). ' +
  'Required fields:\n\n' +

  '  normalized_name      - lowercase slug, no spaces (e.g. "figma")\n' +
  '  display_name         - proper casing (e.g. "Figma")\n' +
  '  has_official_mcp     - boolean: does this product ship an official MCP server?\n' +
  '  connector_type       - "rest" or "graphql"\n' +
  '  base_url             - REST API base URL (e.g. "https://api.figma.com/v1")\n' +
  '  auth_type            - "bearer" | "api-key" | "oauth2" | "basic"\n' +
  '      Choose carefully:\n' +
  '        "bearer"  — single token in Authorization: Bearer {token}\n' +
  '        "api-key" — single key, may go in a custom header or as Authorization: Client-ID {token}\n' +
  '        "basic"   — two credentials (username + password/key) combined as base64(user:pass)\n' +
  '        "oauth2"  — full OAuth2 flow\n' +
  '      If an API recently introduced a new token format (e.g. tokens with a prefix like KGAT_,\n' +
  '      sk-, xoxb-, etc.) that works as a Bearer token, use "bearer" even if Basic auth also exists.\n' +
  '      Modern single-token formats are simpler and preferred over legacy Basic auth.\n' +
  '  auth_header_name     - header name (e.g. "Authorization" or "X-Figma-Token")\n' +
  '  auth_header_format   - value template with {token} (e.g. "Bearer {token}" or "Client-ID {token}")\n' +
  '                         {token} will be replaced with the value of required_credentials[0].\n' +
  '                         For basic auth this is always "Basic {token}" — the system computes\n' +
  '                         base64(credentials[0]:credentials[1]) automatically.\n' +

  '  required_credentials - CRITICAL: list EVERY distinct credential the user must supply.\n' +
  '      Think carefully: does this API need only a single token, or does it need BOTH a\n' +
  '      client/application key AND a secret? Many APIs (Unsplash, Twitter, Stripe, etc.)\n' +
  '      require two separate values. Include one entry per distinct credential.\n' +
  '      The FIRST entry in this array is the one used in the auth header ({token} above).\n' +
  '      Each entry has:\n' +
  '        name:        exact key name, lowercase with underscores (e.g. "access_key", "secret_key", "access_token")\n' +
  '        label:       short human label shown in the UI (e.g. "Access Key", "Secret Key", "API Token")\n' +
  '        description: one sentence telling a non-technical user exactly where to find this value\n' +
  '        secret:      true if this value must be masked (passwords, secrets); false for keys/IDs shown in dashboards\n' +
  '      Examples:\n' +
  '        Single-token APIs (GitHub PAT, Figma, Notion): one entry with name "access_token"\n' +
  '        Two-credential APIs (Unsplash, Twitter v1, Twilio): two entries — first is the key/ID, second is the secret\n' +
  '        DO NOT collapse a key+secret pair into a single field.\n' +

  '  test_endpoint        - a safe read-only GET path that succeeds with ONLY the first credential\n' +
  '                         (the one in required_credentials[0]). Must NOT require elevated OAuth scope.\n' +
  '                         Good examples: "/photos?per_page=1", "/v1/charges?limit=1", "/users.info"\n' +
  '                         Bad example: "/me" when that requires a user-level OAuth token but the credential is a client key.\n' +

  '  common_operations    - array of the 6 most useful operations the API actually supports:\n' +
  '      Each entry: {name, method, path, description, path_params (optional array of param names)}\n' +
  '      Use REAL paths that exist in the API. Include path params as {param_name}.\n' +
  '      CRITICAL: Only include operations you are CERTAIN exist. Do NOT hallucinate endpoints.\n' +

  '  api_limitations      - array of strings describing operations the REST API does NOT support\n' +
  '      (e.g. "Cannot create new files via REST API — use the desktop app")\n' +
  '      Be accurate and specific. This prevents the agent from attempting impossible operations.\n' +

  '  setup_steps          - array of strings: steps a non-technical user must follow to obtain credentials.\n' +
  '                         If there are two credentials, explain how to get BOTH.\n' +
  '  documentation_url    - official API docs URL\n' +
  '  discovery_metadata   - object with any extra info (e.g. mcp_package for MCP-capable services)\n' +

  '\nIMPORTANT: The required_credentials and test_endpoint fields are critical for usability.\n' +
  '  - required_credentials must list every credential the user needs to supply — never merge two into one.\n' +
  '  - If an API supports BOTH a key+secret pair AND a single access-token, PREFER the key+secret form.\n' +
  '    A key+secret pair is more secure (the secret is never exposed in headers), easier to revoke,\n' +
  '    and is what the API provider recommends for server-side use.\n' +
  '  - test_endpoint must be a path that works with required_credentials[0] alone (no extra scopes).\n' +
  '  - common_operations must contain real, tested API paths — wrong paths cause 404 errors.\n' +
  '\nFor graphql connector_type, include the graphql endpoint as base_url and note in ' +
  'api_limitations that all operations require GraphQL query syntax.\n'

export class ConnectorDiscoveryService {
  async discover(productName: string): Promise<ConnectorRegistryEntry> {
    const normalized = productName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

    // 1. Check registry cache.
    try {
      const cached = await registryRepo.findByName(normalized)
      if (cached) return cached
    } catch {
      // Registry table may not exist yet — proceed to LLM discovery.
    }

    // 2. LLM-powered discovery.
    const entry = await this.discoverViaLLM(productName, normalized)

    // 3. Persist to registry (best-effort).
    try {
      return await registryRepo.upsert(entry)
    } catch {
      return { ...entry, id: '', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
    }
  }

  // Also exposed for direct calls in tests / routes that want to bypass the cache.
  async rediscover(productName: string): Promise<ConnectorRegistryEntry> {
    const normalized = productName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    const entry = await this.discoverViaLLM(productName, normalized)
    try {
      return await registryRepo.upsert(entry)
    } catch {
      return { ...entry, id: '', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
    }
  }

  private async discoverViaLLM(productName: string, normalized: string): Promise<UpsertRegistryInput> {
    const llm = llmRegistry.getDefault()
    const resp = await llm.generate({
      systemPrompt: DISCOVERY_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `Discover the API connector for: ${productName}` }],
      temperature: 0,
    })

    let parsed: Record<string, unknown>
    try {
      const raw = resp.content.replace(/^```[a-z]*\n?/m, '').replace(/\n?```$/m, '').trim()
      parsed = JSON.parse(raw)
    } catch {
      throw new Error(`Discovery failed: LLM did not return valid JSON for "${productName}"`)
    }

    const str = (k: string, fallback = ''): string => {
      const v = parsed[k]; return typeof v === 'string' ? v : fallback
    }
    const bool = (k: string, fallback = false): boolean => {
      const v = parsed[k]; return typeof v === 'boolean' ? v : fallback
    }
    const arr = <T>(k: string): T[] => {
      const v = parsed[k]; return Array.isArray(v) ? (v as T[]) : []
    }
    const obj = (k: string): Record<string, unknown> => {
      const v = parsed[k]
      return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
    }

    const authType = str('auth_type', 'bearer') as 'bearer' | 'api-key' | 'oauth2' | 'basic'
    const connType = str('connector_type', 'rest') as 'rest' | 'mcp-http'

    return {
      normalized_name: str('normalized_name', normalized),
      display_name: str('display_name', productName),
      connector_type: connType,
      has_official_mcp: bool('has_official_mcp'),
      base_url: str('base_url') || null,
      auth_type: authType,
      auth_header_name: str('auth_header_name') || null,
      auth_header_format: str('auth_header_format') || null,
      required_credentials: arr('required_credentials'),
      setup_steps: arr('setup_steps'),
      documentation_url: str('documentation_url') || null,
      discovery_metadata: {
        ...obj('discovery_metadata'),
        test_endpoint: str('test_endpoint') || null,
        common_operations: arr('common_operations'),
        api_limitations: arr<string>('api_limitations'),
      },
      last_verified_at: new Date().toISOString(),
    }
  }
}

export const connectorDiscovery = new ConnectorDiscoveryService()
