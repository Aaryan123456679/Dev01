import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import type { HonoEnv } from '../types/common'
import { authMiddleware } from '../middleware/auth'
import { tenantMiddleware } from '../middleware/tenant'
import { mcpRegistry } from '../lib/mcp/registry'

const router = new Hono<HonoEnv>()

router.use('*', authMiddleware, tenantMiddleware)

router.get('/probe/:artifactId', async (c) => {
  const tenantCtx = c.get('tenantCtx')
  const artifactId = c.req.param('artifactId')

  const result = await mcpRegistry.execute('media.probe', { artifactId }, {
    tenantId: tenantCtx.tenantId,
    userId: tenantCtx.userId,
    role: tenantCtx.role,
  })

  return c.json(result)
})

router.post(
  '/thumbnail',
  zValidator('json', z.object({ artifactId: z.string().uuid() })),
  async (c) => {
    const tenantCtx = c.get('tenantCtx')
    const { artifactId } = c.req.valid('json')

    const result = await mcpRegistry.execute('media.thumbnail', { artifactId }, {
      tenantId: tenantCtx.tenantId,
      userId: tenantCtx.userId,
      role: tenantCtx.role,
    })

    return c.json(result, 201)
  }
)

router.post(
  '/transcode',
  zValidator('json', z.object({
    artifactId: z.string().uuid(),
    outputFormat: z.string().optional(),
    maxWidthPx: z.number().int().positive().optional(),
  })),
  async (c) => {
    const tenantCtx = c.get('tenantCtx')
    const body = c.req.valid('json')

    const result = await mcpRegistry.execute('media.transcode', body, {
      tenantId: tenantCtx.tenantId,
      userId: tenantCtx.userId,
      role: tenantCtx.role,
    })

    return c.json(result, 201)
  }
)

export { router as mediaRouter }
