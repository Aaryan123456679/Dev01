# PROJECT_BOOTSTRAP_FOR_Dev01.md

## PURPOSE

This document instructs Dev01 (the LLM-based system builder) how to reason about, extend, and maintain this platform. All core implementation phases are complete. Current work is production hardening and feature polish.

---

## CURRENT STATE (AS OF 2026-06-09)

All 12 milestones implemented. The following major post-milestone features are also live:

- **Universal Connector System** — LLM-powered API discovery, multi-credential storage, GenericRestConnector
- **Per-user daily usage tracking** — `.usage.json` keyed by userId; resets at UTC midnight
- **Quality settings per capability** — localStorage-persisted tiers per feature area
- **Chat UI polish** — retry/edit on user messages, collapsible errors, overflow-safe bubbles
- **Notion OAuth removed** — Notion goes through generic connector flow like all other providers
- **Gemini 2.x models removed** — `gemini-2.0-flash` and `gemini-2.0-flash-lite` have 0 free-tier quota on this project
- **Gemini 2.5 thinking model support** — `thinkingBudget:0` omitted for 2.5+ models; thinking-token parts filtered from responses
- **503 auto-retry** — GeminiProvider retries transient 503s up to 3× with 2s/4s/6s backoff

Stack finalized:
- **Backend**: TypeScript · Hono · Node.js (CommonJS)
- **Auth**: Supabase Auth
- **DB**: Supabase Postgres with service-role client (bypasses RLS); RLS is second-line defense
- **LLM**: Gemini via `@google/generative-ai` — active models: `gemini-flash-lite-latest`, `gemini-2.5-flash-lite`, `gemini-flash-latest`, `gemini-2.5-flash`
- **Sandbox**: E2B for cloud; Docker dev-only (throws in production)
- **Storage**: Supabase Storage, 4 private buckets
- **MCP**: Static registry with 6 adapters + `GenericRestConnector` for dynamic connector tools
- **Frontend**: Next.js 14 App Router with Supabase SSR, SSE streaming chat

---

## ROOT PROJECT STRUCTURE

```
/project-root
├── Metadata/         — HLD, LLD, System Explanations
├── Documentation/    — Operator and developer guides
├── Code/             — All source code
│   ├── backend/      — Hono TypeScript API
│   ├── ui/           — Next.js 14 frontend
│   ├── .env          — docker-compose secrets (fill & never commit)
│   └── docker-compose.yml
├── Thoughts/         — Architectural decision logs (append-only)
├── HLD_LLD.md        — Complete architectural blueprint
├── Agent.md          — This file
├── README.md         — Quick start
└── Results.md        — Implementation status
```

---

## ARCHITECTURAL INVARIANTS

These must never be violated in future changes:

1. **Sandboxes never persist context internally.** Context lives in Postgres, injected at execution time via `/tmp/context.json`.
2. **All external service calls go through MCP.** The orchestrator calls `mcpRegistry.execute(toolName, input, ctx)` — never directly instantiating providers. Exception: connector session calls go through `ConnectorSession`.
3. **Every DB query is tenant-scoped.** `TenantScopedRepository<T>` base class. No query without `tenant_id` filter.
4. **VALID_TRANSITIONS is enforced.** No direct state assignments on sandboxes. Always call `assertTransition()`.
5. **AuditService never throws.** Audit failures are logged and swallowed — never block the request path.
6. **DockerSandboxProvider throws in production.** `if (NODE_ENV === 'production') throw`. This is intentional.
7. **CommonJS only.** No ESM imports (no `.js` extensions). `"module": "CommonJS"` in tsconfig.
8. **Backend uses service-role key.** Never expose service-role key to frontend. Frontend uses anon key only.
9. **All connector credentials are encrypted at rest.** `encryptSecret` / `decryptSecret` from `lib/crypto/secrets.ts`. Never store raw tokens in DB.
10. **Connector validation is best-effort.** A 401 on the test endpoint fails the connect only if the error explicitly signals an invalid token. 404s and service errors do not block connection.

---

## CODE LOCATIONS (CRITICAL PATHS)

| Concern | File |
|---|---|
| Server boot + registry wiring | `Code/backend/src/index.ts` |
| MCP registry + execution | `Code/backend/src/lib/mcp/registry.ts` |
| Agent orchestration | `Code/backend/src/lib/agents/orchestrator.ts` |
| Intent classification | `Code/backend/src/lib/agents/intent.ts` |
| Workflow execution | `Code/backend/src/lib/workflows/engine.ts` |
| Sandbox state machine | `Code/backend/src/lib/sandbox/manager.ts` |
| Auth middleware | `Code/backend/src/middleware/auth.ts` |
| RBAC + quotas | `Code/backend/src/middleware/rbac.ts`, `src/types/common.ts` |
| Context snapshot | `Code/backend/src/lib/context/service.ts` |
| All DB row types | `Code/backend/src/types/common.ts` |
| Supabase clients | `Code/backend/src/lib/supabase/client.ts` |
| Storage service | `Code/backend/src/lib/supabase/storage.ts` |
| Streaming execute route | `Code/backend/src/routes/execute.ts` |
| Frontend streaming | `Code/ui/lib/api/client.ts` (`api.stream()`) |
| Chat message component | `Code/ui/components/ChatMessage.tsx` |
| Settings modal | `Code/ui/components/SettingsModal.tsx` |
| **Connector discovery** | `Code/backend/src/lib/connectors/discovery.ts` |
| **Generic REST connector** | `Code/backend/src/lib/mcp/connectors/generic.ts` |
| **Connector session** | `Code/backend/src/lib/mcp/connectors/session.ts` |
| **User connectors loader** | `Code/backend/src/lib/integrations/userConnectors.ts` |
| **Dynamic tools** | `Code/backend/src/lib/integrations/dynamicTools.ts` |
| **Integrations routes** | `Code/backend/src/routes/integrations.ts` |
| **Connectors manager UI** | `Code/ui/components/ConnectorsManager.tsx` |
| **LLM model catalog + usage** | `Code/backend/src/lib/llm/models.ts` |
| **Gemini provider** | `Code/backend/src/lib/llm/gemini.ts` |
| **Secret crypto** | `Code/backend/src/lib/crypto/secrets.ts` |

---

## CONNECTOR SYSTEM — HOW IT WORKS

1. User types a product name → `POST /api/v1/integrations/discover`
2. `ConnectorDiscoveryService` checks `connector_registry` table first (cache hit), otherwise calls Gemini to produce a `ConnectorRegistryEntry` with auth type, required credentials, test endpoint, common operations
3. User fills in credentials → `POST /api/v1/integrations/connect`
4. Backend validates via test endpoint (or falls back to parameterless GET from `common_operations`); only hard-fails on definitive invalid-token signals
5. All credentials stored individually encrypted in `metadata.credentials`; primary token also in `access_token` column
6. At chat time: `loadUserConnectors()` decrypts credentials, builds `GenericRestConnector` instances
7. `GenericRestConnector` wires auth headers (`bearer` / `api-key` / `basic` / `oauth2`) and exposes `rawRequest()` and a `call_{provider}_api` MCP tool
8. The agent can also call `define_connector_function` to invent and persist new reusable tool templates

Auth type routing in `GenericRestConnector.authHeaders()`:
- `basic` → `Buffer.from('cred[0]:cred[1]').toString('base64')`; credential order from `required_credentials` array
- all others → `auth_header_format.replace('{token}', primaryToken)`

---

## ADDING A NEW MCP ADAPTER

1. Create `Code/backend/src/lib/mcp/adapters/{name}.adapter.ts`
2. Implement `MCPProvider` interface: `readonly name`, `readonly version`, `readonly category`, `tools(): MCPTool[]`, `execute(toolName, input, ctx)`
3. Each `MCPTool` needs: `name`, `description`, `category`, `version`, `inputSchema` (Zod)
4. Register in `Code/backend/src/index.ts`: `mcpRegistry.register(new MyAdapter())`
5. Add new `MCPCategory` string literal to `Code/backend/src/lib/mcp/types.ts` if needed

---

## ADDING A NEW LLM PROVIDER

1. Create `Code/backend/src/lib/llm/{name}.ts` implementing `LLMProvider` interface
2. Must implement: `readonly name`, `generate(request: GenerateRequest)`, `stream(request: GenerateRequest)` (AsyncGenerator), `embeddings()`
3. `GenerateRequest` now includes `userId?: string` — thread it through to `recordUsage(model, userId)`
4. Register in `index.ts`: `llmRegistry.register(new MyProvider()); llmRegistry.setDefault('myProvider')`

---

## ADDING A NEW SELECTABLE MODEL

1. Add entry to `AVAILABLE_MODELS` in `Code/backend/src/lib/llm/models.ts`
2. Update `TEXT_QUALITY_TO_MODEL` map in `Code/ui/components/SettingsModal.tsx` if it should map to a quality tier
3. If the model is a thinking model (reasoning tokens), ensure `thinkingConfig` is omitted or budget ≥ 1 in `gemini.ts`

---

## MIGRATION RULES

- Migrations are numbered `001` → `009` and run sequentially in Supabase SQL editor
- New migrations increment the number; never edit existing migrations
- RLS policies are in `008_rls_policies.sql` — update there when adding new tables
- pg_cron schedules are in `009_cron.sql`

---

## THOUGHTS LOG RULES

Every architectural change (not feature work) creates a new entry:

```
Thoughts/YYYY-MM-DD/Run_N/
  why_it_was_done/{decision}.md
```

No deletion of historical entries. Document tradeoffs and alternatives considered.

---

## WHAT IS LEFT (PRODUCTION HARDENING)

1. Replace in-memory rate limiter with Redis
2. Add ffmpeg binary to media pipeline for real transcoding
3. Add ClamAV or similar for upload virus scanning
4. Add torrent support to DownloadManager
5. Dynamic MCP provider discovery (database-driven, not static)
6. Dedicated sandbox snapshot support
7. GPU scheduling integration with E2B GPU tier
8. Multi-region deployment strategy
9. Per-user usage stored in DB (currently `.usage.json` — survives restarts but not horizontal scale)
10. Connector credential rotation UI (currently requires re-connecting)
11. Image/Video/TTS/STT capability implementations (quality settings exist, backends are stubs)
