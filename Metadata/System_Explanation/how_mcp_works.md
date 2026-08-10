# How MCP Works

The Model Context Protocol (MCP) abstraction layer wraps all external services (LLM, Vision, Storage, Sandbox, etc.).

## Responsibilities
-   Provider discovery
-   Capability scoping
-   Version control
-   Swapping providers (e.g. open source vs paid)

This allows the platform to be agnostic to the underlying provider implementation.
