import { Hono } from 'hono'
import { AVAILABLE_MODELS, getUsage } from '../lib/llm/models'
import type { HonoEnv } from '../types/common'

export const modelsRouter = new Hono<HonoEnv>()

// List selectable models (model switcher).
modelsRouter.get('/', async (c) => {
  return c.json({ data: AVAILABLE_MODELS })
})

// Today's per-user per-model usage vs. the free-tier daily limit.
modelsRouter.get('/usage', async (c) => {
  const { userId } = c.get('tenantCtx')
  return c.json({ data: getUsage(userId) })
})
