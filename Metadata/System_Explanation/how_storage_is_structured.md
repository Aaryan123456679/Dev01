# How Storage Is Structured

Storage is divided into structured updates (DB), ephemeral state (Redis), and artifacts (Object Storage).

## Object Storage Structure
- `/tenants/{tenant_id}/users/{user_id}/artifacts/`
- `/tenants/{tenant_id}/media/`
- `/tenants/{tenant_id}/snapshots/`

There are no shared buckets. Each tenant is isolated.
