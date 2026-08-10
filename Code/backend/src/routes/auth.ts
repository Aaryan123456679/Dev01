import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { UserRepo } from '../repositories/user.repo'
import { TenantRepo } from '../repositories/tenant.repo'
import { authMiddleware } from '../middleware/auth'
import { AuthError, ROLE_QUOTAS } from '../types/common'
import type { HonoEnv } from '../types/common'

export const authRouter = new Hono<HonoEnv>()

const userRepo = new UserRepo()
const tenantRepo = new TenantRepo()

authRouter.get('/me', authMiddleware, async (c) => {
  const { userId, tenantId, role } = c.get('tenantCtx')

  const [dbUser, tenant] = await Promise.all([
    userRepo.findById(userId),
    tenantRepo.findById(tenantId),
  ])

  if (!dbUser) throw new AuthError('User not found')

  const quota = ROLE_QUOTAS[role]

  return c.json({
    user: {
      id: dbUser.id,
      email: dbUser.email,
      tenantId: dbUser.tenant_id,
      tenantName: tenant.name,
      plan: tenant.plan_type,
      role: dbUser.role,
      createdAt: dbUser.created_at,
    },
    quota: {
      maxSandboxes: quota.maxSandboxes,
      maxExecutionSeconds: quota.maxExecutionSeconds,
      maxMemoryMb: quota.maxMemoryMb,
      gpuAccess: quota.gpuAccess,
    },
  })
})

const VALID_PLANS = ['free', 'standard', 'power', 'enterprise'] as const
const UpdatePlanSchema = z.object({ plan: z.enum(VALID_PLANS) })
const UpdateProfileSchema = z.object({ tenantName: z.string().min(2).max(64) })

authRouter.patch('/plan', authMiddleware, zValidator('json', UpdatePlanSchema), async (c) => {
  const { tenantId, role } = c.get('tenantCtx')
  if (role !== 'admin') throw new AuthError('Only workspace admins can change the plan')
  const { plan } = c.req.valid('json')
  const tenant = await tenantRepo.updatePlan(tenantId, plan)
  return c.json({ plan: tenant.plan_type })
})

authRouter.patch('/profile', authMiddleware, zValidator('json', UpdateProfileSchema), async (c) => {
  const { tenantId, role } = c.get('tenantCtx')
  if (role !== 'admin') throw new AuthError('Only workspace admins can edit the workspace')
  const { tenantName } = c.req.valid('json')
  const tenant = await tenantRepo.updateName(tenantId, tenantName)
  return c.json({ tenantName: tenant.name })
})
