# Platform Overview

This is a modular, multi-tenant execution system designed to enable AI-assisted workflows, secure sandboxed code execution, media pipelines, and more.

## Core Layers
- WebUI Layer (Next.js + Clerk hosted auth UI)
- API Gateway Layer (Hono, CORS, rate limiting)
- Auth & Session Layer (Clerk JWTs — no passwords stored; lazy tenant provisioning on first sign-in)
- Agent & Workflow Engine
- MCP Abstraction Layer
- Sandbox Execution Layer (E2B Firecracker in production)
- Context & Storage Layer (Supabase Postgres + object storage)
- Media & Download Subsystems
- Observability & Safety Layer

The system emphasizes strict multi-tenancy, strong isolation, and pluggable providers via MCP. Authentication is fully delegated to Clerk — Supabase is used only as a database and storage host.
