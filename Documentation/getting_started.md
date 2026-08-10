# Getting Started

Welcome to the MCP-Driven Multi-Tenant Execution Platform.

This platform lets you run AI-assisted workflows in isolated cloud sandboxes with full multi-tenancy and RBAC.

## Quick Links

- [Local Setup](local_setup.md) — prerequisites, Supabase setup, migrations, running locally
- [Environment Variables](environment_variables.md) — full variable reference
- [API Reference](api_reference.md) — all HTTP endpoints
- [Role Permissions](role_permissions.md) — RBAC and quotas
- [Security Model](security_model.md) — auth, isolation, audit

## Architecture in One Paragraph

A user prompt hits the Hono backend, which classifies intent via Gemini, builds a workflow, allocates an E2B cloud sandbox, injects conversation context into it, asks Gemini to generate code, runs that code in the sandbox, streams results back as SSE events, and tears the sandbox down — all enforced at the tenant level, with every step audited and every service call routed through the MCP registry.
