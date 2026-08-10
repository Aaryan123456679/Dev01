# Auth Service (Low Level Design)

## Overview

Authentication is fully delegated to **Clerk**. The backend never stores passwords or issues its own tokens. Supabase is used only as a Postgres database and object storage host.

## Responsibilities

- Verify Clerk JWTs on every protected request
- Auto-provision tenant + user rows on first sign-in (lazy provisioning)
- Link pre-Clerk users by email on first Clerk sign-in
- Enforce role-based access control (RBAC)
- Enforce tenant isolation on all DB queries

## Auth Flow

```
Browser → Clerk SDK → Clerk (sign-in/sign-up)
Browser → GET /api/v1/... (Authorization: Bearer <clerk_jwt>)
Backend → verifyToken(jwt, CLERK_SECRET_KEY) — local, no network call
Backend → users table lookup by clerk_user_id
  → if not found: fetch email from Clerk API, provision tenant+user row
  → if email matches existing row: link clerk_user_id to existing row
Backend → set tenantCtx { userId, tenantId, role, email }
```

## APIs

- `GET /auth/me` — returns the authenticated user's profile and plan
- `GET /auth/plan` — returns plan type and quota for the authenticated tenant

> POST /login, /logout, /refresh are **removed** — Clerk handles the full session lifecycle.

## Roles

- Admin
- Power
- Standard
- Read-Only

Each role defines:
- Sandbox quota
- Execution time limits
- Memory limits
- GPU access
- Tool availability

## Lazy Provisioning (idempotent)

On first authenticated request:

1. Extract `sub` (Clerk user ID) from verified JWT
2. Query `users` WHERE `clerk_user_id = sub`
3. If found → proceed
4. If not found:
   a. Fetch user from Clerk API to get email
   b. Query `users` WHERE `email = clerkEmail`
   c. If row found → `UPDATE users SET clerk_user_id = sub` (link pre-Clerk user)
   d. If no row → create tenant (`{emailPrefix}-{sub[-8:]}`) + user row with `randomUUID()` as `id`
5. Tenant creation is idempotent: `findByName` before `create` to reuse any orphaned tenant from a prior failed attempt

## Security

- JWT verification is local (uses Clerk's public key embedded in the token) — no latency from Clerk API on every request
- `CLERK_SECRET_KEY` is server-only — never sent to the browser
- Token sourcing in the frontend uses `window.Clerk.session.getToken()` — short-lived, auto-rotated by Clerk SDK

## Database Schema (Relevant parts)

### users
- `id` (UUID, generated via `randomUUID()` — no longer references `auth.users`)
- `tenant_id` (FK → tenants)
- `clerk_user_id` (VARCHAR 255, UNIQUE, nullable for legacy rows)
- `role`
- `email`
- `created_at`

### tenants
- `id` (UUID)
- `name` (UNIQUE — format: `{emailPrefix}-{clerkUserId[-8:]}`)
- `plan_type`
- `created_at`
