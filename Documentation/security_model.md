# Security Model

## Authentication

- **Clerk** is the identity provider. It handles sign-up, sign-in, session management, and JWT issuance.
- The frontend embeds Clerk's hosted UI components (`<SignIn>`, `<SignUp>`) at `/auth/login` and `/auth/register`.
- On every API request, the frontend calls `window.Clerk.session.getToken()` to get a short-lived JWT and sends it as `Authorization: Bearer <token>`.
- The backend verifies JWTs with `verifyToken(token, { secretKey: CLERK_SECRET_KEY })` from `@clerk/backend`. No token round-trip to Clerk servers is required for verification — the JWT is verified locally against Clerk's public key.

### Lazy User Provisioning

On the first authenticated request from a new Clerk user, the backend auto-provisions a tenant and user row:

1. Extract `sub` (Clerk user ID) from the verified JWT
2. Look up `users` table by `clerk_user_id`
3. If not found — fetch the user's email from Clerk API (`clerk.users.getUser()`)
4. If a user row already exists for that email (pre-Clerk user), stamp it with `clerk_user_id` (link)
5. Otherwise, create a new tenant (`{emailPrefix}-{clerkUserId[-8:]}`) and user row

This makes provisioning idempotent: retries reuse orphaned tenants and find existing email rows.

## Authorization (RBAC)

Four roles: `admin`, `power`, `standard`, `readonly`.

- `ROLE_HIERARCHY`: admin=4, power=3, standard=2, readonly=1
- `requireRole(minRole)` middleware blocks requests below the threshold
- Quotas enforced in `SandboxManager.create()` before allocation

## Multi-Tenancy

Every DB query goes through `TenantScopedRepository` which injects `tenant_id` on all operations. Storage objects are prefixed `tenants/{tenantId}/...`. No query or storage path can cross tenant boundaries in application code.

RLS policies on all Postgres tables provide a second line of defense for direct dashboard access.

## Sandbox Isolation

- **E2B** (cloud, production): Firecracker microVM isolation. No Docker socket, no host filesystem access.
- **Docker** (local dev only): `DockerSandboxProvider` throws if `NODE_ENV === 'production'`.
- Sandboxes are stateless — context is injected at execution time, never persisted inside.
- `VALID_TRANSITIONS` map is frozen. Invalid state transitions throw `SandboxStateError`.

## Rate Limiting

In-memory token-bucket per `userId`. Configurable via `RATE_LIMIT_MAX` and `RATE_LIMIT_WINDOW_MS`.

> For multi-instance deployments, replace with a Redis-backed rate limiter.

## CORS

Restricted to the `ALLOWED_ORIGINS` environment variable (comma-separated). In production, set this to your frontend domain only (e.g. `https://app.yourdomain.com`).

## Storage

- All 4 buckets are private. No public URLs.
- Signed URLs expire in 15 minutes.
- File size limits enforced at upload: 50MB (uploads), 100MB (downloads).
- MIME type validation on upload.

## Audit Logging

All write operations emit to `audit_logs` via `AuditService`. The table is append-only (service-role only; no application-level deletes). High-severity events (`auth.logout_forced`, `tenant.deleted`, `quota.exceeded`) are forwarded to `AUDIT_ALERT_WEBHOOK_URL` if configured.

## Keys

| Key | Scope | Where |
|---|---|---|
| `CLERK_SECRET_KEY` | Server-only | Backend env + Next.js server (middleware) |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Public | Frontend env, browser |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only | Backend env |
| `SUPABASE_ANON_KEY` | Server-only | Backend env (realtime only) |
| `GEMINI_API_KEY` | Server-only | Backend env |
| `E2B_API_KEY` | Server-only | Backend env |
| `INTEGRATION_ENCRYPTION_KEY` | Server-only | Backend env |
