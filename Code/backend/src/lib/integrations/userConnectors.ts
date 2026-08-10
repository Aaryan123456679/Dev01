// Load all server-side Connector instances for a user. Tokens are decrypted here
// and never forwarded to the browser.
//
// All providers (including Notion) go through GenericRestConnector — no special
// cases. Notion internal-integration tokens work as standard Bearer tokens.

import { IntegrationRepo } from '../../repositories/integration.repo'
import { ConnectorRegistryRepo } from '../../repositories/connectorRegistry.repo'
import { decryptSecret } from '../crypto/secrets'
import { GenericRestConnector } from '../mcp/connectors/generic'
import type { Connector } from '../mcp/connectors/types'

const repo = new IntegrationRepo()
const registryRepo = new ConnectorRegistryRepo()

export async function loadUserConnectors(tenantId: string, userId: string): Promise<Connector[]> {
  const connectors: Connector[] = []
  try {
    const conns = await repo.listByUser(tenantId, userId)

    // Load registry entries in one pass to avoid N+1.
    const registryMap = new Map<string, Awaited<ReturnType<typeof registryRepo.findByName>>>()
    if (conns.length) {
      await Promise.all(
        conns.map(async (cn) => {
          try {
            const entry = await registryRepo.findByName(cn.provider)
            if (entry) registryMap.set(cn.provider, entry)
          } catch {
            // Registry table missing or provider not yet discovered — skip.
          }
        }),
      )
    }

    for (const cn of conns) {
      const entry = registryMap.get(cn.provider)
      if (!entry) continue // not yet in registry; skip rather than crash

      // Reconstruct the full credentials map. Connections saved after the multi-
      // credential migration store all values (each encrypted) in metadata.credentials.
      // Older single-token connections fall back to { <primaryName>: decrypted }.
      const storedCreds = cn.metadata?.credentials as Record<string, string> | undefined
      let credentials: Record<string, string>
      if (storedCreds && typeof storedCreds === 'object') {
        credentials = Object.fromEntries(
          Object.entries(storedCreds).map(([k, v]) => [k, decryptSecret(v)])
        )
      } else {
        const primaryName = (entry.required_credentials[0] as { name?: string } | undefined)?.name ?? 'access_token'
        credentials = { [primaryName]: decryptSecret(cn.access_token) }
      }

      connectors.push(
        new GenericRestConnector(entry, credentials, cn.account_label ?? undefined),
      )
    }
  } catch {
    // If the integrations tables are not present yet, return empty list.
  }
  return connectors
}
