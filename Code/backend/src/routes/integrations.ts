import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { IntegrationRepo } from '../repositories/integration.repo'
import { ConnectorRegistryRepo } from '../repositories/connectorRegistry.repo'
import { encryptSecret } from '../lib/crypto/secrets'
import { connectorDiscovery } from '../lib/connectors/discovery'
import { GenericRestConnector } from '../lib/mcp/connectors/generic'
import { AppError } from '../types/common'
import type { HonoEnv } from '../types/common'

const repo = new IntegrationRepo()
const registryRepo = new ConnectorRegistryRepo()

// ── Authenticated integration management (mounted at /api/v1/integrations) ─────
export const integrationsRouter = new Hono<HonoEnv>()

// GET /api/v1/integrations — list all connections + registry
integrationsRouter.get('/', async (c) => {
  const { tenantId, userId } = c.get('tenantCtx')
  let conns: Awaited<ReturnType<typeof repo.listByUser>> = []
  try { conns = await repo.listByUser(tenantId, userId) } catch { conns = [] }

  let registry: Awaited<ReturnType<typeof registryRepo.listAll>> = []
  try { registry = await registryRepo.listAll() } catch { registry = [] }

  return c.json({
    data: conns.map((cn) => ({ provider: cn.provider, accountLabel: cn.account_label, connectedAt: cn.created_at })),
    registry,
  })
})

// ── Discovery ─────────────────────────────────────────────────────────────────

const DiscoverSchema = z.object({ productName: z.string().min(1) })
integrationsRouter.post('/discover', zValidator('json', DiscoverSchema), async (c) => {
  const { productName } = c.req.valid('json')
  const entry = await connectorDiscovery.discover(productName)
  return c.json({ entry })
})

const RediscoverSchema = z.object({ productName: z.string().min(1) })
integrationsRouter.post('/rediscover', zValidator('json', RediscoverSchema), async (c) => {
  const { productName } = c.req.valid('json')
  const entry = await connectorDiscovery.rediscover(productName)
  return c.json({ entry })
})

integrationsRouter.get('/registry', async (c) => {
  let registry: Awaited<ReturnType<typeof registryRepo.listAll>> = []
  try { registry = await registryRepo.listAll() } catch { registry = [] }
  return c.json({ registry })
})

// ── Connector CRUD ────────────────────────────────────────────────────────────

// `credentials` is a map from credential name → value.
// The primary credential (required_credentials[0]) drives the auth header.
// All credentials are stored encrypted in metadata.credentials for runtime use.
const ConnectSchema = z.object({
  provider: z.string().min(1),
  credentials: z.record(z.string(), z.string().min(1)),
  accountLabel: z.string().nullish(),
})
integrationsRouter.post('/connect', zValidator('json', ConnectSchema), async (c) => {
  const { tenantId, userId } = c.get('tenantCtx')
  const { provider, credentials, accountLabel } = c.req.valid('json')

  let entry
  try { entry = await registryRepo.findByName(provider) } catch { entry = null }
  if (!entry) throw new AppError(`Unknown connector "${provider}". Run /discover first.`, 404, 'NOT_FOUND')

  // Primary credential: first required_credentials name when it matches, else first provided value.
  const primaryName = (entry.required_credentials[0] as { name?: string } | undefined)?.name
  const primaryToken = (primaryName && credentials[primaryName]) || Object.values(credentials)[0]
  if (!primaryToken) throw new AppError('No credentials provided', 400, 'BAD_REQUEST')

  // Validate by test call, falling back to parameterless GET endpoints from common_operations.
  const connector = new GenericRestConnector(entry, credentials, accountLabel ?? undefined)
  const meta = entry.discovery_metadata as Record<string, unknown>
  const testPath = (meta?.test_endpoint as string | undefined) ?? null
  type CommonOp = { method: string; path: string; path_params?: string[] }
  const commonOps: CommonOp[] = Array.isArray(meta?.common_operations) ? meta.common_operations as CommonOp[] : []

  if (testPath || commonOps.length) {
    let validated = false
    let lastError = ''
    if (testPath) {
      try { await connector.rawRequest('GET', testPath); validated = true }
      catch (err) { lastError = (err as Error).message ?? '' }
    }
    if (!validated) {
      for (const op of commonOps) {
        if (op.method !== 'GET' || op.path.includes('{')) continue
        try { await connector.rawRequest('GET', op.path); validated = true; break }
        catch { /* try next */ }
      }
    }
    if (!validated && lastError) {
      const isInvalidToken = /invalid.*token|token.*invalid|bad.*key|key.*invalid|unauthorized|invalid_client/i.test(lastError)
      if (isInvalidToken) throw new AppError(`Credential validation failed: ${lastError}`, 400, 'INVALID_CREDENTIALS')
    }
  }

  const encryptedCredentials: Record<string, string> = {}
  for (const [k, v] of Object.entries(credentials)) encryptedCredentials[k] = encryptSecret(v)

  await repo.upsert(tenantId, userId, {
    provider,
    accessToken: encryptSecret(primaryToken),
    accountLabel: accountLabel ?? null,
    metadata: { registry_id: entry.id, credentials: encryptedCredentials },
  })

  return c.json({ ok: true, provider, displayName: entry.display_name })
})

integrationsRouter.delete('/:provider', async (c) => {
  const { tenantId, userId } = c.get('tenantCtx')
  const provider = c.req.param('provider')
  await repo.remove(tenantId, userId, provider)
  return c.body(null, 204)
})

// Empty stub — kept so index.ts import doesn't break if not yet updated.
export const oauthRouter = new Hono<HonoEnv>()
