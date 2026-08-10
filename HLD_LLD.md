# Dev01 — AI Console Platform
## Architectural Blueprint (Implemented State — 2026-06-09)

---

## 1. Architectural Overview

Dev01 is a multi-tenant AI console enabling streaming chat, sandboxed code execution across 10+ languages, universal REST connector discovery, media pipelines, download management, file storage, and MCP-based service abstraction.

### Implemented Stack

| Component | Choice | Rationale |
|---|---|---|
| API Framework | Hono (TypeScript) | Edge-compatible, zero-overhead, typed middleware |
| Auth | Supabase Auth | JWT + RLS, built-in token refresh, no custom crypto |
| Database | Supabase Postgres | Managed, RLS, pg_cron, no separate infra |
| LLM | Gemini (4 active models) | Cost-effective, large context, free tier available |
| Embeddings | text-embedding-004 | Native in same API |
| Sandbox (cloud) | E2B | Firecracker-based, no socket mount, free 100h/month |
| Sandbox (local) | Dockerode | Dev-only; throws if NODE_ENV=production |
| Connector Discovery | LLM-powered (Gemini) | Zero-config API integration for any REST service |
| Storage | Supabase Storage | 4 private buckets, tenant-path isolated |
| Frontend | Next.js 14 (App Router) | Server components + streaming SSE |
| Validation | Zod | Runtime schema enforcement at all boundaries |

---

## 2. Core Design Principles

- **Sandboxes are stateless executors** — context is never persisted inside a sandbox
- **Context is external and persistent** — stored in Postgres, injected at execution time
- **All capabilities wrap behind MCP** — no direct service calls from orchestrator
- **Strict multi-tenancy** — `tenant_id` filter on every DB query, tenant-prefixed storage paths
- **Strong isolation** — no cross-tenant access; RLS as second line of defense
- **Pluggable providers** — `LLMProvider` and `MCPProvider` interfaces allow swap without orchestrator changes
- **Append-only audit** — `audit_logs` table is service-role only, no application-level deletes

---

## 3. Component Architecture

### 3.1 API Gateway (Hono)

Entry: `src/index.ts`

- CORS restricted to `ALLOWED_ORIGINS`
- Global `requestMetricsMiddleware` (structured JSON timing logs)
- Public: `/auth/*`, `/health`
- Protected: `/api/v1/*` — all requests pass through `authMiddleware → tenantMiddleware`

### 3.2 Auth & RBAC

Roles and quotas (enforced in `SandboxManager`):

| Role | Max Sandboxes | Timeout | Memory |
|---|---|---|---|
| admin | 8 | 300s | 512MB |
| power | 4 | 120s | 256MB |
| standard | 1 | 30s | 128MB |
| readonly | 0 | — | — |

- `ROLE_HIERARCHY` map: `admin=4, power=3, standard=2, readonly=1`
- `requireRole(minRole)` middleware uses hierarchy comparison
- Token revocation: `sha256(JWT)` stored in `sessions` table on logout; checked on every authenticated request

### 3.3 Context Model

```
ContextSnapshot {
  conversation: { id, title, createdAt }
  messages: [{ role, content, createdAt }]   ← last 20
  artifacts: [{ id, filename, mimeType }]
}
```

Persisted in Postgres. Injected into sandboxes as `/tmp/context.json`.

### 3.4 Sandbox State Machine

```
CREATED → CONTEXT_INJECTED → RUNNING → COMPLETED
                                     ↘ FAILED
         TERMINATED (any state, via manager.destroy or pg_cron expiry)
         EXPIRED     (pg_cron: > 10 min in non-terminal state)
         SNAPSHOT_SAVED (future: dedicated sandboxes)
```

`VALID_TRANSITIONS` map is frozen. `SandboxStateError` thrown on invalid transition. Enforced in `SandboxManager.assertTransition()`.

### 3.5 MCP Layer

Registry keyed by `MCPCategory` (one active provider per category):

| Category | Provider | Tools |
|---|---|---|
| llm | LLMMCPAdapter → GeminiProvider | `llm.generate`, `llm.stream`, `llm.embeddings` |
| sandbox | SandboxMCPAdapter → SandboxManager | `sandbox.create`, `sandbox.inject`, `sandbox.execute`, `sandbox.destroy` |
| storage | StorageMCPAdapter → SupabaseStorageService | `storage.upload`, `storage.signedUrl`, `storage.delete` |
| file | FileMCPAdapter → Supabase | `file.read`, `file.list`, `file.delete` |
| download | DownloadMCPAdapter → DownloadManager | `download.fetch`, `download.status` |
| media | MediaMCPAdapter → MediaPipeline | `media.probe`, `media.thumbnail`, `media.transcode` |
| connector (dynamic) | GenericRestConnector (per-user, per-provider) | `call_{provider}_api`, `define_connector_function` |

All calls: `mcpRegistry.execute(toolName, input, ctx)` — validates Zod schema before dispatch.

### 3.6 Agent & Workflow Engine

**AgentOrchestrator** (11 steps):
1. Persist user message
2. Build context snapshot
3. Classify intent (Gemini, temp=0) → `code_execution | file_operation | download | media | conversation`
4. Build workflow definition
5. Allocate sandbox (quota-checked)
6. Inject context → `CONTEXT_INJECTED`
7. Execute workflow steps (WorkflowEngine)
8. For `code_execution`: LLM generates code → execute in sandbox → yield stdout
9. Update context
10. Teardown sandbox (in `finally`)
11. Persist assistant message

**WorkflowEngine**: AsyncGenerator. Creates DB workflow record, iterates steps, calls `mcpRegistry.execute()`. On error: up to 3 retries, exponential backoff (500ms base). Persists step result to DB before advancing.

**SSE Streaming**: `streamSSE` from `hono/streaming`. Yields `WorkflowEvent` NDJSON until `workflow.completed` or `workflow.failed`.

### 3.7 Storage

4 private Supabase Storage buckets. Path format:

```
tenants/{tenantId}/users/{userId}/{bucket}/{filename}
```

Signed URLs for downloads (15-minute TTL). Artifacts tracked in `artifacts` table.

### 3.9 Connector System

**Flow:**
1. `POST /api/v1/integrations/discover` → `ConnectorDiscoveryService` checks `connector_registry` table, otherwise calls Gemini to produce a `ConnectorRegistryEntry` (auth type, required credential names, test endpoint, common operations)
2. `POST /api/v1/integrations/connect` → backend encrypts each credential individually, stores in `integration_connections` table; validates via test endpoint (soft-fail on 404/503, hard-fail on 401)
3. At chat time: `loadUserConnectors()` decrypts credentials, builds `GenericRestConnector` instances
4. `GenericRestConnector` adds itself to the orchestrator tool list and exposes `call_{provider}_api`
5. The agent may also call `define_connector_function` to create reusable named templates

**Auth type routing:**
- `bearer` / `api-key` / `oauth2` → `auth_header_format.replace('{token}', primaryToken)`
- `basic` → `Authorization: Basic base64(cred[0]:cred[1])`

**Security:**
- All tokens encrypted with AES-256 via `encryptSecret` / `decryptSecret` (`Code/backend/src/lib/crypto/secrets.ts`)
- Encrypted blob stored in `metadata.credentials`; primary token also in `access_token` column for fast lookup

### 3.10 Chat UI / Quality Settings

**Quality Settings** (`SettingsModal.tsx` → Quality tab):
- 7 independently configurable capability tiers: Image Generation, Video Generation, TTS, STT, Text Conversations, Connectors (+ max instances), Sandboxing (+ max instances)
- Tiers: `low | medium | high | extra-high` → map to specific Gemini models for text
- Stored in `localStorage` under key `quality-settings`; changing text tier dispatches `model-changed` event to live-update the active model

**Text Quality → Model mapping:**
| Tier | Model | Daily limit (per user) |
|---|---|---|
| low | `gemini-flash-lite-latest` | 1000 |
| medium | `gemini-2.5-flash-lite` | 1000 |
| high | `gemini-flash-latest` | 250 |
| extra-high | `gemini-2.5-flash` | 20 |

**Chat UX improvements:**
- **Retry**: hover a user message → retry icon re-runs the turn from that index
- **Edit**: hover a user message → edit icon opens inline textarea; submitting replaces the turn and re-runs
- **Collapsible errors**: errors show as one-line categorized summary; expand via chevron for full detail
- **Overflow safety**: `overflow-hidden` on bubbles, `break-words min-w-0` on all text nodes

### 3.8 Observability

- **Logger**: structured JSON to stdout/stderr (`src/lib/observability/logger.ts`)
- **Metrics**: `requestMetricsMiddleware` — logs method, path, status, durationMs, tenantId, userId
- **Audit**: `AuditService.log()` — inserts to `audit_logs`, never throws (best-effort)
- **Edge Functions**: `sandbox-expire` (terminates stale sandboxes), `audit-webhook` (forwards high-severity events)
- **pg_cron**: sandbox expiry every 5 min, conversation purge daily at 03:00 UTC

---

## 4. Database Schema

### tenants
`id` · `name` · `plan_type` · `created_at`

### users
`id` · `tenant_id` · `role` · `email` · `created_at`

### sessions (token revocation list)
`id` · `user_id` · `token_hash` (sha256) · `created_at`

### conversations
`id` · `tenant_id` · `user_id` · `title` · `created_at` · `deleted_at`

### messages
`id` · `conversation_id` · `tenant_id` · `role` · `content` · `created_at`

### workflows
`id` · `tenant_id` · `user_id` · `conversation_id` · `state` · `intent` · `created_at` · `completed_at`

### workflow_steps
`id` · `workflow_id` · `name` · `state` · `output` · `error` · `created_at`

### sandbox_instances
`id` · `tenant_id` · `user_id` · `provider_sandbox_id` · `state` · `type` · `started_at` · `terminated_at` · `expires_at`

### artifacts
`id` · `tenant_id` · `user_id` · `conversation_id` · `filename` · `mime_type` · `size_bytes` · `bucket` · `storage_path` · `source_url` · `created_at` · `deleted_at`

### mcp_providers
`id` · `tenant_id` · `name` · `category` · `version` · `is_active` · `config` · `capabilities` · `created_at`

### audit_logs (append-only)
`id` · `tenant_id` · `user_id` · `action` · `resource_type` · `resource_id` · `metadata` · `ip_address` · `created_at`

---

## 5. Multi-Tenancy Enforcement

Enforced at four layers:
1. **DB queries** — `TenantScopedRepository` base class injects `tenant_id` filter on every query
2. **Storage paths** — `tenants/{tenantId}/...` prefix on all objects
3. **API middleware** — `authMiddleware` sets `tenantCtx`; `tenantMiddleware` validates it is present
4. **RLS policies** — Supabase RLS on all tables (second line of defense for direct DB access)

### 5.1 Per-User Daily Usage Tracking

Usage counters are stored in `Code/backend/.usage.json`:

```json
{
  "date": "2026-06-09",
  "users": {
    "{userId}": {
      "gemini-flash-lite-latest": 12,
      "gemini-2.5-flash": 3
    }
  }
}
```

- **Reset**: at UTC midnight the `date` field changes and all counters zero (lazy reset on first write of the new day)
- **Per-user isolation**: each user's counter is independent — one user exhausting their quota does not affect others
- **Future**: migrate to DB table for horizontal-scale safety (currently file-based, not safe across multiple backend replicas)

---

## 6. Security Controls

- CORS restricted to `ALLOWED_ORIGINS`
- Token revocation (sha256 in sessions table)
- In-memory token-bucket rate limiting (replace with Redis for multi-instance)
- Quota enforcement per role (sandbox count, timeout, memory)
- E2B cloud sandbox — no Docker socket, no host filesystem access
- All storage paths tenant-scoped, signed URLs with 15-minute TTL
- `requireAdmin()` / `requireRole()` middleware on sensitive routes
- Audit logging for all write operations

---

## 7. Deferred / Future

| Item | Reason deferred |
|---|---|
| ffmpeg transcoding | Requires ffmpeg binary in container; POC returns original |
| Torrent downloads | bittorrent-protocol + tracker scanning; HTTP-only for POC |
| Redis rate limiting | Multi-instance only; single-node is fine for POC |
| GPU scheduling | Requires separate node pool + E2B GPU tier |
| Dynamic MCP discovery | Static registry sufficient for current provider set |
| Dedicated sandbox snapshots | Needs persistent volume support in E2B |
| Security scanning on uploads | MIME validation done; ClamAV integration deferred |
| Usage tracking in DB | Currently `.usage.json`; needs DB migration for multi-replica safety |
| Connector credential rotation | Requires re-connecting; no rotation UI yet |
| Image / Video / TTS / STT backends | Quality settings UI exists; backends are stubs |

---

## 8. Implementation Phases

| Phase | Scope | Status |
|---|---|---|
| 1 | Auth, context, ephemeral sandbox, basic MCP LLM, single-step workflow | ✅ |
| 2 | RBAC quotas, artifact store, media pipeline, download manager, observability | ✅ |
| 3 | MCP registry with 6 adapters, audit trails, retry logic, SSE streaming | ✅ |
| 4 | Production Dockerfiles, pg_cron, Edge Functions, standalone frontend build | ✅ |
| 5 | Universal connector system, per-user daily limits, quality settings per capability, chat UI polish (retry/edit/collapsible errors/overflow safety), Gemini 2.5 thinking model support, 503 auto-retry | ✅ |
