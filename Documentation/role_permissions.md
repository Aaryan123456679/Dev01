# Role Permissions (RBAC)

## Roles and Quotas

| Role | Max Sandboxes | Max Timeout | Memory Limit | Sandbox Access |
|---|---|---|---|---|
| `admin` | 8 | 300s | 512 MB | Full |
| `power` | 4 | 120s | 256 MB | Full |
| `standard` | 1 | 30s | 128 MB | Full |
| `readonly` | 0 | — | — | None |

## Role Hierarchy

```
admin (4) > power (3) > standard (2) > readonly (1)
```

`requireRole(minRole)` middleware compares numeric hierarchy values. For example, `requireRole('power')` allows `power` and `admin`, blocks `standard` and `readonly`.

## Route-Level Enforcement

| Route / Action | Minimum Role |
|---|---|
| `/api/v1/execute` | `standard` |
| `/api/v1/sandbox/*` | `standard` |
| `/api/v1/storage/upload` | `standard` |
| `/api/v1/mcp/providers` (write) | `admin` |
| `/api/v1/mcp/providers/:id` (delete) | `admin` |
| All read routes | `readonly` |

## How Roles Are Assigned

Roles are stored in the `public.users` table (`role` column). The default role on registration is `standard`. An `admin` can update roles directly in the Supabase dashboard (no API endpoint for role promotion by design — requires explicit operator action).

## Quota Enforcement

`SandboxManager.create()` counts active sandboxes for the user before allocating:

```
SELECT count(*) FROM sandbox_instances
WHERE user_id = $userId
  AND state NOT IN ('TERMINATED','COMPLETED','FAILED')
```

If count ≥ role quota → throws `QuotaError(403)`.
