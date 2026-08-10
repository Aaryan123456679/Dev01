import { createMiddleware } from 'hono/factory'
import { ForbiddenError, ROLE_HIERARCHY } from '../types/common'
import type { HonoEnv, Role } from '../types/common'

export function requireRole(minRole: Role) {
  return createMiddleware<HonoEnv>(async (c, next) => {
    const { role } = c.get('tenantCtx')
    if (ROLE_HIERARCHY[role] < ROLE_HIERARCHY[minRole]) {
      throw new ForbiddenError(
        `This action requires '${minRole}' role or higher. Your role: '${role}'`,
      )
    }
    await next()
  })
}

export function requireAdmin() {
  return requireRole('admin')
}

export function requireStandard() {
  return requireRole('standard')
}
