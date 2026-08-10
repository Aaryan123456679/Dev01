# Sandbox Manager (Low Level Design)

## Overview
Manages the lifecycle of sandboxes (Ephemeral and Dedicated).

## APIs
- `createSandbox()`
- `injectContext()`
- `execute()`
- `collectArtifacts()`
- `destroySandbox()`

**Critical Rule**: Must never persist context internally.

## Sandbox Types
1.  **Ephemeral Task Sandbox**
    -   One per execution step
    -   Auto-destroy
2.  **Dedicated Lease Sandbox**
    -   Time-boxed
    -   Terminal access
    -   Snapshot support

## Isolation
- Docker / Firecracker
- cgroups
- seccomp
- network namespaces

## Sandbox State Machine
States:
- CREATED
- CONTEXT_INJECTED
- RUNNING
- COMPLETED
- FAILED
- TERMINATED
- EXPIRED
- SNAPSHOT_SAVED

Transitions must be explicitly enforced in code.

## Database Schema (Relevant parts)
### sandbox_instances
-   id
-   tenant_id
-   user_id
-   type (ephemeral/dedicated)
-   state
-   resource_limits
-   expires_at
