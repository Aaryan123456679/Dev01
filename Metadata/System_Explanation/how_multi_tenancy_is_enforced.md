# How Multi-Tenancy Is Enforced

Multi-tenancy is a core principle/constraint enforced at multiple layers:

1.  **Identity → Tenant mapping**: On first Clerk sign-in, the auth middleware auto-provisions a dedicated tenant row. Every user belongs to exactly one tenant. The `tenantCtx` (userId, tenantId, role) is set in Hono's context for every authenticated request.
2.  **DB Query Layer**: All queries go through `TenantScopedRepository` which injects `tenant_id` filters. No query can return rows outside the caller's tenant.
3.  **Storage Paths**: All files are stored under `tenants/{tenantId}/...`. Path construction is centralized — no endpoint builds raw paths.
4.  **API Validation**: The `tenantMiddleware` validates that the resolved tenant matches the authenticated user before the request reaches any route handler.
5.  **Sandbox Isolation**: Sandboxes operate in namespaces isolated per tenant context.

There is strictly NO cross-tenant access.
