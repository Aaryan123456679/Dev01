import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import type { HonoEnv } from '../types/common'
import { authMiddleware } from '../middleware/auth'
import { tenantMiddleware } from '../middleware/tenant'
import { mcpRegistry } from '../lib/mcp/registry'

const router = new Hono<HonoEnv>()

router.use('*', authMiddleware, tenantMiddleware)

router.post(
  '/',
  zValidator('json', z.object({
    url: z.string().url(),
    conversationId: z.string().uuid().optional(),
  })),
  async (c) => {
    const tenantCtx = c.get('tenantCtx')
    const body = c.req.valid('json')

    const result = await mcpRegistry.execute('download.fetch', body, {
      tenantId: tenantCtx.tenantId,
      userId: tenantCtx.userId,
      role: tenantCtx.role,
    })

    return c.json(result, 201)
  }
)

router.get('/:artifactId', async (c) => {
  const tenantCtx = c.get('tenantCtx')
  const artifactId = c.req.param('artifactId')

  const result = await mcpRegistry.execute('download.status', { downloadId: artifactId }, {
    tenantId: tenantCtx.tenantId,
    userId: tenantCtx.userId,
    role: tenantCtx.role,
  })

  return c.json(result)
})

export { router as downloadsRouter }
