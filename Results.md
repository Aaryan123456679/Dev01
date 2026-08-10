# Implementation Status

## Current State — All Milestones + Phase 5 Complete (2026-06-09)

The platform is fully implemented across backend, frontend, database, and infrastructure. All 12 milestones (M0–M11) plus Phase 5 post-milestone features are live. The system is ready for production deployment pending only real external service credentials (Supabase, Gemini, E2B) and production hardening items listed below.

---

## Implemented Features

### Backend (TypeScript · Hono · Node.js)

| Milestone | Feature | Files |
|---|---|---|
| M0 | Foundation, tsconfig, package.json, Dockerfile | `Code/backend/` root |
| M1 | Supabase Auth, JWT middleware, RBAC (4 roles), token revocation, rate limiting | `middleware/auth.ts`, `middleware/rbac.ts`, `middleware/ratelimit.ts`, `routes/auth.ts` |
| M2 | Conversation management, ContextSnapshot builder | `lib/context/service.ts`, `routes/conversations.ts` |
| M3 | LLMProvider interface, GeminiProvider (generate/stream/embeddings) | `lib/llm/` |
| M4 | MCPRegistry, LLMMCPAdapter | `lib/mcp/registry.ts`, `lib/mcp/adapters/llm.adapter.ts` |
| M5 | SandboxManager, 8-state machine, E2B provider, Docker provider (dev-only) | `lib/sandbox/` |
| M6 | WorkflowEngine AsyncGenerator, 3-retry exponential backoff, step persistence | `lib/workflows/engine.ts` |
| M7 | AgentOrchestrator (11-step flow), intent classifier, SSE streaming execute endpoint | `lib/agents/`, `routes/execute.ts` |
| M8 | Supabase Storage (4 buckets), ArtifactRepo, upload/sign/delete routes | `lib/supabase/storage.ts`, `routes/storage.ts`, `routes/artifacts.ts` |
| M9 | Frontend routing, Supabase auth client, ConsolePage with streaming terminal | `Code/ui/` |
| M10 | FileMCPAdapter, DownloadMCPAdapter, MediaMCPAdapter, DownloadManager, MediaPipeline | `lib/mcp/adapters/`, `lib/downloads/`, `lib/media/` |
| M11 | Structured JSON logger, AuditService, request metrics middleware, pg_cron migrations, Deno Edge Functions | `lib/observability/`, `supabase/functions/`, migrations 007 + 009 |

### Phase 5 — Post-Milestone Features

| Feature | Description | Key Files |
|---|---|---|
| Universal Connector System | LLM-powered REST API discovery; any product name → auto-configured connector with verified endpoints, auth headers, and injected MCP tools | `lib/connectors/discovery.ts`, `lib/mcp/connectors/generic.ts`, `lib/integrations/userConnectors.ts`, `routes/integrations.ts` |
| Multi-credential storage | Each connector credential encrypted individually at rest (AES-256). Supports bearer, api-key, basic, oauth2 | `lib/crypto/secrets.ts`, `integration_connections` table |
| Per-user daily usage tracking | `.usage.json` keyed by userId; each user gets full API quota independently; resets at UTC midnight | `lib/llm/models.ts`, `lib/llm/gemini.ts` |
| Quality settings per capability | 7 capability tiers (image, video, TTS, STT, text, connectors, sandboxing) with Low/Medium/High/Extra-High levels; text tier auto-switches active model | `Code/ui/components/SettingsModal.tsx` |
| Gemini 2.5 thinking model support | `thinkingBudget:0` is invalid for 2.5+ models — omitted conditionally; `thought:true` response parts filtered out | `lib/llm/gemini.ts` |
| 503 auto-retry with backoff | GeminiProvider retries transient 503 errors up to 3× (2s / 4s / 6s); quota errors fail fast | `lib/llm/gemini.ts` |
| Chat UI: retry & edit | Hover any user message to retry it or edit and re-send; slices conversation history to the edited turn | `Code/ui/components/ChatMessage.tsx`, `Code/ui/app/console/page.tsx` |
| Chat UI: collapsible errors | Error messages show as one-line categorized summary (Quota exceeded, Service unavailable, etc.) with expandable detail | `Code/ui/components/ChatMessage.tsx` |
| Chat UI: overflow safety | `overflow-hidden`, `break-words`, `min-w-0` enforced on all text nodes, message bubbles, and Markdown wrapper | `ChatMessage.tsx`, `Markdown.tsx` |
| Removed 2.0 Flash models | `gemini-2.0-flash` and `gemini-2.0-flash-lite` have 0 free-tier quota on this API project — removed entirely | `lib/llm/models.ts`, `SettingsModal.tsx` |
| Connector system prompt tuning | Orchestrator system prompt instructs model to answer general questions directly without invoking connector tools | `lib/agents/orchestrator.ts` |

### Active Model Catalog

| Model ID | Label | Daily Limit (per user) | Notes |
|---|---|---|---|
| `gemini-flash-lite-latest` | Gemini Flash-Lite (latest) | 1000 | Low quality tier |
| `gemini-2.5-flash-lite` | Gemini 2.5 Flash-Lite | 1000 | Medium quality tier |
| `gemini-flash-latest` | Gemini Flash (latest) | 250 | High quality tier |
| `gemini-2.5-flash` | Gemini 2.5 Flash | 20 | Extra-High quality tier; thinking model |

### Database (Supabase Postgres)

9 migration files in `Code/backend/supabase/migrations/`:

| File | Creates |
|---|---|
| 001 | `tenants`, `users`, `sessions` + triggers |
| 002 | `conversations` (with soft-delete) |
| 003 | `workflows`, `sandbox_instances` |
| 004 | `artifacts` |
| 005 | `mcp_providers` + Gemini seed row |
| 006 | `source_url` column on artifacts, indexes |
| 007 | `audit_logs` (append-only, RLS service-only) |
| 008 | RLS policies on all tables, `auth_tenant_id()` helper |
| 009 | pg_cron: sandbox expiry (every 5 min), conversation purge (daily) |

Additional tables added by connector system:
- `connector_registry` — LLM-discovered API definitions (cache)
- `integration_connections` — per-user encrypted connector credentials

### Frontend (Next.js 14)

- Auth pages: `/auth/login`, `/auth/register`
- Console: `/console` — conversation sidebar, streaming chat, file upload
- Settings modal: Profile · Quality · Models · Agents · Connectors · Appearance tabs
- ConnectorsManager: discover, connect, disconnect any REST API
- Supabase SSR middleware for route protection
- Typed API client with SSE stream support

### Infrastructure

- `Code/docker-compose.yml` — backend + frontend, env via `Code/.env`
- Dockerfiles: backend (multi-stage, Node 20), frontend (standalone Next.js output)
- Deno Edge Functions: `sandbox-expire`, `audit-webhook`

---

## What Is NOT Done (Deferred to Production Hardening)

1. Redis for rate limiting (currently in-memory, single-instance only)
2. Real ffmpeg transcoding in MediaPipeline (POC returns original)
3. Torrent support in DownloadManager (HTTP-only for POC)
4. ClamAV or equivalent for upload virus scanning
5. GPU scheduling / E2B GPU tier
6. Dynamic MCP provider discovery (static registry at startup)
7. Dedicated sandbox snapshot support
8. Per-user usage tracking in DB (currently `.usage.json` — not safe for multi-replica deployments)
9. Connector credential rotation UI (currently requires full re-connect)
10. Image / Video / TTS / STT capability backends (quality settings UI exists; backends are stubs)

---

## How to Run

See [Documentation/local_setup.md](Documentation/local_setup.md).
