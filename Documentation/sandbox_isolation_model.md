# Sandbox Isolation Model

Based on HLD Section 3.5.

## Isolation Mechanisms
-   **Docker / Firecracker**: Container/MicroVM isolation.
-   **cgroups**: Resource limitation (CPU, Memory).
-   **seccomp**: System call filtering.
-   **Network Namespaces**: Network isolation.

Sandboxes are stateless executors.
