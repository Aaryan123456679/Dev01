# API Reference

Base URL: `http://localhost:8000` (dev) or your deployed backend URL.

All `/api/v1/*` routes require `Authorization: Bearer <supabase_access_token>`.

---

## Auth (`/auth`)

| Method | Path | Description |
|---|---|---|
| POST | `/auth/register` | Create account + tenant. Body: `{ email, password, tenantName? }` |
| POST | `/auth/login` | Sign in. Body: `{ email, password }`. Returns `{ session }` |
| POST | `/auth/logout` | Revoke current token. Requires auth header |
| POST | `/auth/refresh` | Refresh session. Body: `{ refreshToken }` |
| GET | `/auth/me` | Returns current user + tenant + role quota |

---

## Execute (`/api/v1/execute`)

| Method | Path | Description |
|---|---|---|
| POST | `/api/v1/execute` | Run agent. Body: `{ prompt, conversationId?, stream? }` |

When `stream: true`, response is SSE (NDJSON). Each line is a `WorkflowEvent`:
- `workflow.started` — workflow created
- `step.started` / `step.output` / `step.completed` / `step.failed`
- `workflow.completed` / `workflow.failed`

---

## Conversations (`/api/v1/conversations`)

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/conversations` | List conversations (paginated) |
| POST | `/api/v1/conversations` | Create conversation. Body: `{ title? }` |
| GET | `/api/v1/conversations/:id` | Get conversation + messages |
| DELETE | `/api/v1/conversations/:id` | Soft-delete |

---

## Workflows (`/api/v1/workflows`)

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/workflows` | List workflows. Query: `state`, `limit` |
| GET | `/api/v1/workflows/:id` | Get workflow + steps |
| POST | `/api/v1/workflows/:id/cancel` | Cancel running workflow |

---

## Sandbox (`/api/v1/sandbox`) — power+ role

| Method | Path | Description |
|---|---|---|
| POST | `/api/v1/sandbox/create` | Allocate sandbox. Body: `{ type: "ephemeral"\|"dedicated" }` |
| POST | `/api/v1/sandbox/:id/inject` | Inject context JSON |
| POST | `/api/v1/sandbox/:id/execute` | Run command. Body: `{ command, timeoutSeconds? }` |
| GET | `/api/v1/sandbox/:id/status` | Get state + expiry |
| DELETE | `/api/v1/sandbox/:id` | Destroy sandbox |

---

## Storage (`/api/v1/storage`)

| Method | Path | Description |
|---|---|---|
| POST | `/api/v1/storage/upload` | Multipart upload. Returns `{ artifactId, signedUrl }` |
| GET | `/api/v1/storage/sign/:path` | Get fresh signed URL for artifact |
| DELETE | `/api/v1/storage/:path` | Delete artifact |

---

## Artifacts (`/api/v1/artifacts`)

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/artifacts` | List artifacts (tenant-scoped) |
| GET | `/api/v1/artifacts/:id` | Get artifact metadata |
| DELETE | `/api/v1/artifacts/:id` | Soft-delete artifact |

---

## Downloads (`/api/v1/downloads`)

| Method | Path | Description |
|---|---|---|
| POST | `/api/v1/downloads` | Fetch remote URL and store as artifact. Body: `{ url, conversationId? }` |
| GET | `/api/v1/downloads/:artifactId` | Get download artifact status |

---

## Media (`/api/v1/media`)

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/media/probe/:artifactId` | Probe media type and metadata |
| POST | `/api/v1/media/thumbnail` | Generate thumbnail. Body: `{ artifactId }` |
| POST | `/api/v1/media/transcode` | Transcode (POC: pass-through). Body: `{ artifactId, outputFormat?, maxWidthPx? }` |

---

## MCP (`/api/v1/mcp`) — admin role

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/mcp/providers` | List registered providers (DB + live registry) |
| POST | `/api/v1/mcp/providers` | Register provider record in DB |
| GET | `/api/v1/mcp/providers/:id` | Get provider |
| DELETE | `/api/v1/mcp/providers/:id` | Deactivate provider |
| GET | `/api/v1/mcp/resolve/:category` | Resolve active provider for category |
| GET | `/api/v1/mcp/tools` | List all registered tools |

---

## Models / Usage (`/api/v1/models`)

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/models` | List all available models with `dailyLimit` and `description` |
| GET | `/api/v1/models/usage` | Get current user's daily usage per model (`used`, `remaining`) |

---

## Integrations / Connectors (`/api/v1/integrations`)

| Method | Path | Description |
|---|---|---|
| POST | `/api/v1/integrations/discover` | Body: `{ query: "Kaggle" }`. Returns a connector definition (auth type, required credentials, common operations). Cached in `connector_registry` table. |
| POST | `/api/v1/integrations/connect` | Body: `{ connectorId, credentials: Record<string, string> }`. Validates, encrypts, and stores credentials. |
| GET | `/api/v1/integrations` | List current user's active connector connections |
| DELETE | `/api/v1/integrations/:id` | Disconnect and remove a connector |

Connector credentials are encrypted at rest using AES-256 via `INTEGRATION_ENCRYPTION_KEY`.

---

## Health

| Method | Path | Description |
|---|---|---|
| GET | `/health` | `{ status: "ok", version, timestamp }` — no auth required |
