import type { MiddlewareHandler } from 'hono'
import type { HonoEnv } from '../../types/common'
import { logger } from './logger'

export const requestMetricsMiddleware: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const start = Date.now()
  const method = c.req.method
  const path = new URL(c.req.url).pathname

  await next()

  const durationMs = Date.now() - start
  const status = c.res.status

  logger.info('request', {
    method,
    path,
    status,
    durationMs,
    tenantId: c.get('tenantCtx')?.tenantId,
    userId: c.get('tenantCtx')?.userId,
  })
}
