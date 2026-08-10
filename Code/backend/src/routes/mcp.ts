import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { McpProviderRepo } from '../repositories/mcp.repo'
import { mcpRegistry } from '../lib/mcp/registry'
import { requireAdmin } from '../middleware/rbac'
import { NotFoundError } from '../types/common'
import type { HonoEnv } from '../types/common'
import type { MCPCategory } from '../lib/mcp/types'

export const mcpRouter = new Hono<HonoEnv>()
const repo = new McpProviderRepo()

const RegisterProviderSchema = z.object({
  name: z.string().min(1),
  category: z.enum([
    'llm','vision','speech','ocr','embeddings',
    'storage','sandbox','media','download','file',
  ]),
  version: z.string().default('1.0.0'),
  config: z.record(z.unknown()).default({}),
  capabilities: z.array(z.unknown()).default([]),
})

mcpRouter.get('/providers', async (c) => {
  const { tenantId } = c.get('tenantCtx')
  const records = await repo.findAll(tenantId)
  const live = mcpRegistry.listProviders()
  return c.json({ data: records, live })
})

mcpRouter.post('/providers', requireAdmin(), zValidator('json', RegisterProviderSchema), async (c) => {
  const { tenantId } = c.get('tenantCtx')
  const body = c.req.valid('json')
  const record = await repo.create({
    ...body,
    tenant_id: tenantId,
    is_active: true,
  })
  return c.json(record, 201)
})

mcpRouter.get('/providers/:id', async (c) => {
  const record = await repo.findById(c.req.param('id'))
  return c.json(record)
})

mcpRouter.delete('/providers/:id', requireAdmin(), async (c) => {
  await repo.deactivate(c.req.param('id'))
  return c.body(null, 204)
})

mcpRouter.get('/resolve/:category', async (c) => {
  const category = c.req.param('category') as MCPCategory
  const provider = mcpRegistry.resolve(category)
  return c.json({
    name: provider.name,
    category: provider.category,
    version: provider.version,
    tools: provider.tools().map((t) => ({ name: t.name, description: t.description })),
  })
})

mcpRouter.get('/tools', (c) => {
  const tools = mcpRegistry.discover()
  return c.json({ data: tools.map((t) => ({ name: t.name, category: t.category, description: t.description })) })
})
