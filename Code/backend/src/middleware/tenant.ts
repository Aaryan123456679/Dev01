import { createMiddleware } from 'hono/factory'
import { AuthError } from '../types/common'
import type { HonoEnv } from '../types/common'

// Validates that TenantContext was set by authMiddleware and enriches
// the request with a unique ID for tracing.
export const tenantMiddleware = createMiddleware<HonoEnv>(async (c, next) => {
  const tenantCtx = c.get('tenantCtx')
  if (!tenantCtx?.tenantId) {
    throw new AuthError('Tenant context missing — ensure authMiddleware runs first')
  }

  const requestId = `${tenantCtx.tenantId.slice(0, 8)}-${Date.now()}`
  c.set('requestId', requestId)
  c.header('X-Request-Id', requestId)

  await next()
})
