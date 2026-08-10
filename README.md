# Dev01 — AI Console Platform

A production-grade, multi-tenant AI console with sandboxed code execution, a universal connector system, streaming chat, and per-capability quality controls — all backed by Gemini and E2B.

## [Live Link](https://dev01-frontend.onrender.com/console)

## Stack

| Layer | Technology |
|---|---|
| Backend | TypeScript · Hono · Node.js |
| Frontend | Next.js 14 · Tailwind CSS |
| Auth | Supabase Auth (JWT + RLS) |
| Database | Supabase Postgres (SQL migrations) |
| Storage | Supabase Storage (4 private buckets) |
| LLM | Gemini (Flash-Lite / 2.5 Flash-Lite / Flash / 2.5 Flash) |
| Sandbox | E2B cloud · Docker (local dev only) |
| Connectors | LLM-discovered REST APIs via `ConnectorDiscoveryService` |
| Validation | Zod throughout |

## Project Structure

```
/
├── Code/
│   ├── backend/          # Hono TypeScript API
│   │   ├── src/
│   │   │   ├── index.ts              # Entry — boots registries, mounts routes
│   │   │   ├── lib/
│   │   │   │   ├── agents/           # Intent classifier + AgentOrchestrator
│   │   │   │   ├── connectors/       # ConnectorDiscoveryService (LLM-powered)
│   │   │   │   ├── context/          # ContextSnapshot service
│   │   │   │   ├── crypto/           # Secret encryption/decryption for stored tokens
│   │   │   │   ├── downloads/        # DownloadManager (HTTP, 100 MB cap)
│   │   │   │   ├── integrations/     # userConnectors loader, dynamicTools
│   │   │   │   ├── llm/              # LLMProvider interface + GeminiProvider
│   │   │   │   ├── mcp/              # MCPRegistry + adapters + GenericRestConnector
│   │   │   │   ├── media/            # MediaPipeline (probe/thumbnail/transcode)
│   │   │   │   ├── observability/    # Structured logger, AuditService, metrics
│   │   │   │   ├── sandbox/          # SandboxManager + E2B + Docker providers
│   │   │   │   ├── supabase/         # Admin + anon client, StorageService
│   │   │   │   └── workflows/        # WorkflowEngine (AsyncGenerator, retries)
│   │   │   ├── middleware/           # auth, rbac, ratelimit, tenant
│   │   │   ├── repositories/         # TenantScopedRepository base + repos
│   │   │   ├── routes/               # Route modules
│   │   │   └── types/                # Shared types, error classes
│   │   └── supabase/
│   │       ├── migrations/           # 001–009 SQL migrations (run in order)
│   │       └── functions/            # Deno Edge Functions
│   ├── ui/               # Next.js 14 frontend
│   │   ├── app/          # App Router pages
│   │   ├── components/   # Chat UI, ConnectorsManager, SettingsModal
│   │   └── lib/          # Supabase clients, API client, types
│   ├── .env              # docker-compose secrets template (fill & never commit)
│   └── docker-compose.yml
├── Metadata/             # HLD + LLD + System Explanations
├── Documentation/        # Operator & developer guides
├── Thoughts/             # Architectural decision logs
├── HLD_LLD.md            # Architectural blueprint (current)
├── Agent.md              # System builder instructions
└── Results.md            # Implementation status
```

## Quick Start (Local Dev)

See [Documentation/local_setup.md](Documentation/local_setup.md) for the complete walkthrough.

**Short version:**
1. Create a Supabase project and get keys.
2. Copy `Code/.env`, fill in real values.
3. Run migrations 001–009 in Supabase SQL editor.
4. Create 4 Storage buckets: `uploads`, `artifacts`, `media`, `downloads` (all private).
5. Get Gemini and E2B API keys.
6. `cd Code && docker compose up --build`

Frontend → `http://localhost:3000` · Backend health → `http://localhost:8000/health`

## Key Features

### Chat Console
- Streaming SSE responses with animated loading states
- **Retry** and **Edit** on any sent message (hover to reveal)
- Collapsible error display: one-line summary with expandable full detail
- Text stays within bubble bounds — `break-words` + `overflow-hidden` enforced everywhere

### Model Selection
- 4 active Gemini models: Flash-Lite (latest), 2.5 Flash-Lite, Flash (latest), 2.5 Flash
- **Per-user** daily usage counters — each user gets the full API quota independently
- Counters reset at UTC midnight and persist across backend restarts
- Gemini 2.5 models skip `thinkingBudget:0` (not valid for thinking models)
- Automatic 3× retry with backoff on transient 503 errors

### Quality Settings (per-capability)
Settings → Quality tab configures independent quality tiers for:
- Image Generation, Video Generation, TTS, STT, Text Conversations
- Connectors (quality + max instances 1–10)
- Sandboxing (quality + max instances 1–8)
- Selecting a text quality tier auto-switches the active model

### Universal Connector System
- Type any product name → LLM discovers its API, auth type, and required credentials
- Supports `bearer`, `api-key`, `basic`, `oauth2` auth types
- Multi-credential storage: each credential encrypted individually at rest
- Connectors inject verified endpoints into the agent's context (no hallucinated paths)
- Notion, Kaggle, Unsplash, GitHub, Figma, Slack, etc. — all generic, no hardcoding

### Sandbox Execution
- Python (default), plus JavaScript, TypeScript, Go, C/C++, Java, Rust, Ruby, PHP, Bash
- Auto-installs missing pip packages and apt system deps
- Sandbox button forces code generation + execution path

## Architecture

See [Metadata/HLD/architecture_overview.md](Metadata/HLD/architecture_overview.md) and [HLD_LLD.md](HLD_LLD.md).

## API Reference

See [Documentation/api_reference.md](Documentation/api_reference.md).
