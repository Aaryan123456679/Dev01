import { createMiddleware } from 'hono/factory'
import { verifyToken, createClerkClient } from '@clerk/backend'
import { UserRepo } from '../repositories/user.repo'
import { TenantRepo } from '../repositories/tenant.repo'
import { AuthError } from '../types/common'
import type { HonoEnv, Role } from '../types/common'

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY })

export const authMiddleware = createMiddleware<HonoEnv>(async (c, next) => {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    throw new AuthError('Missing or malformed Authorization header')
  }

  const token = authHeader.slice(7)

  let payload: { sub?: string }
  try {
    payload = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY! })
  } catch (err) {
    console.error('[auth] verifyToken failed:', (err as Error).message)
    throw new AuthError('Invalid or expired token')
  }

  const clerkUserId = payload.sub
  if (!clerkUserId) throw new AuthError('Invalid token payload')

  const userRepo = new UserRepo()
  let dbUser = await userRepo.findByClerkId(clerkUserId).catch((err) => {
    console.error('[auth] findByClerkId failed:', err.message)
    throw err
  })

  if (!dbUser) {
    try {
      const clerkUser = await clerk.users.getUser(clerkUserId)
      const email = clerkUser.emailAddresses[0]?.emailAddress ?? `${clerkUserId}@unknown`

      // If a pre-Clerk user row exists for this email, link it instead of creating a duplicate.
      const existingByEmail = await userRepo.findByEmail(email)
      if (existingByEmail) {
        dbUser = await userRepo.linkClerkId(existingByEmail.id, clerkUserId)
      } else {
        const tenantRepo = new TenantRepo()
        // Use clerkUserId as part of the name — globally unique, idempotent on retry.
        const baseName = email.split('@')[0] ?? 'workspace'
        const tenantName = `${baseName}-${clerkUserId.slice(-8)}`
        // If a previous failed attempt already created the tenant, reuse it.
        let tenant = await tenantRepo.findByName(tenantName)
        if (!tenant) tenant = await tenantRepo.create(tenantName)
        dbUser = await userRepo.createFromClerk(clerkUserId, tenant.id, email)
      }
    } catch (err) {
      console.error('[auth] provision failed:', (err as Error).message)
      throw err
    }
  }

  c.set('tenantCtx', {
    userId: dbUser.id,
    tenantId: dbUser.tenant_id,
    role: dbUser.role as Role,
    email: dbUser.email,
  })

  await next()
})
