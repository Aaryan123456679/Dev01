# How Sandboxes Work

Sandboxes are stateless executors. They are created on demand, executed, and then destroyed.

## Lifecycle
1.  CREATED
2.  CONTEXT_INJECTED
3.  RUNNING
4.  COMPLETED
5.  FAILED
6.  TERMINATED
7.  EXPIRED
8.  SNAPSHOT_SAVED

## Types
- **Ephemeral Task Sandbox**: For single execution steps. Auto-destroyed.
- **Dedicated Lease Sandbox**: Time-boxed, supporting terminal access and snapshots.

## Isolation
Implemented via Docker/Firecracker, cgroups, seccomp, and network namespaces.
