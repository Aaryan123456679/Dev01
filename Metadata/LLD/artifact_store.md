# Artifact Store (Low Level Design)

## Overview
Manages file storage for artifacts generated during execution or uploaded by users.

## Storage Structure
Object storage path format:
- `/tenants/{tenant_id}/users/{user_id}/artifacts/`
- `/tenants/{tenant_id}/media/`
- `/tenants/{tenant_id}/snapshots/`

No shared buckets.

## Database Schema (Relevant parts)
### artifacts
-   id
-   tenant_id
-   user_id
-   storage_path
-   type
-   created_at

## Multi-Tenancy
Enforced at Storage paths: `/tenants/{tenant_id}/...`
