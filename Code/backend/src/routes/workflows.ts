import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { WorkflowRepo } from '../repositories/workflow.repo'
import type { HonoEnv } from '../types/common'

export const workflowsRouter = new Hono<HonoEnv>()
const repo = new WorkflowRepo()

const ListQuerySchema = z.object({
  state: z.enum(['pending','running','completed','failed','cancelled']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

workflowsRouter.get('/', zValidator('query', ListQuerySchema), async (c) => {
  const { tenantId } = c.get('tenantCtx')
  const { state, limit } = c.req.valid('query')
  const workflows = await repo.findByTenantPaginated(tenantId, state, limit)
  return c.json({ data: workflows })
})

workflowsRouter.get('/:id', async (c) => {
  const { tenantId } = c.get('tenantCtx')
  const workflow = await repo.findById(c.req.param('id'), tenantId)
  return c.json(workflow)
})

workflowsRouter.post('/:id/cancel', async (c) => {
  const { tenantId } = c.get('tenantCtx')
  const workflow = await repo.findById(c.req.param('id'), tenantId)

  if (workflow.state !== 'running') {
    return c.json({ error: 'Workflow is not running' }, 409)
  }

  await repo.updateState(workflow.id, 'cancelled')
  return c.json({ workflowId: workflow.id, state: 'cancelled' })
})
