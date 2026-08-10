import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { sandboxManager } from '../lib/sandbox/manager'
import { requireStandard } from '../middleware/rbac'
import type { HonoEnv } from '../types/common'

export const sandboxRouter = new Hono<HonoEnv>()

const CreateSchema = z.object({
  type: z.enum(['ephemeral', 'dedicated']).default('ephemeral'),
})

const ExecuteSchema = z.object({
  command: z.string().min(1).max(10_000),
  timeoutSeconds: z.number().int().min(1).max(300).optional(),
})

sandboxRouter.post('/create', requireStandard(), zValidator('json', CreateSchema), async (c) => {
  const { tenantId, userId, role } = c.get('tenantCtx')
  const { type } = c.req.valid('json')
  const sandbox = await sandboxManager.create(tenantId, userId, role, type)
  return c.json({ sandboxId: sandbox.id, state: sandbox.state }, 201)
})

sandboxRouter.post('/:id/inject', requireStandard(), async (c) => {
  const { tenantId } = c.get('tenantCtx')
  const snapshot = await c.req.json()
  const sandbox = await sandboxManager.injectContext(c.req.param('id'), tenantId, snapshot)
  return c.json({ sandboxId: sandbox.id, state: sandbox.state })
})

sandboxRouter.post('/:id/execute', requireStandard(), zValidator('json', ExecuteSchema), async (c) => {
  const { tenantId } = c.get('tenantCtx')
  const { command, timeoutSeconds } = c.req.valid('json')
  const result = await sandboxManager.execute(c.req.param('id'), tenantId, command, timeoutSeconds)
  return c.json(result)
})

sandboxRouter.get('/:id/status', async (c) => {
  const { tenantId } = c.get('tenantCtx')
  const sandbox = await sandboxManager.getStatus(c.req.param('id'), tenantId)
  return c.json({ sandboxId: sandbox.id, state: sandbox.state, expiresAt: sandbox.expires_at })
})

sandboxRouter.delete('/:id', requireStandard(), async (c) => {
  const { tenantId } = c.get('tenantCtx')
  await sandboxManager.destroy(c.req.param('id'), tenantId)
  return c.body(null, 204)
})
