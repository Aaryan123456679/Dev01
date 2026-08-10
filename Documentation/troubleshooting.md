# Troubleshooting

## Backend won't start

**"Cannot find module"** — Run `npm install` in `Code/backend/`.

**"SUPABASE_URL is undefined"** — Check that `Code/backend/.env` exists and has real values.

**"invalid API key"** — Supabase keys must be the full JWT string. Don't truncate them.

---

## Migrations fail

**"relation does not exist"** — Migrations must be run in order (001 → 014). If you skip one, later migrations reference tables that don't exist yet.

**pg_cron errors on 009** — Enable the `pg_cron` extension first: Supabase Dashboard → Database → Extensions → pg_cron.

**Migration 014 errors** — Run 013 first. 014 depends on the `clerk_user_id` column added in 013.

---

## Sandbox errors

**"E2B quota exceeded"** — E2B free tier is 100 CPU-hours/month. Check your dashboard at e2b.dev.

**"SandboxStateError: invalid transition"** — A sandbox is being used after it was destroyed or failed. The orchestrator's `finally` block handles cleanup; check if an earlier request left an orphaned sandbox.

**"DockerSandboxProvider cannot run in production"** — Set `SANDBOX_PROVIDER=e2b` in your env. Docker provider is dev-only by design.

---

## Auth errors

**401 on `/api/v1/...`** — The Clerk JWT is missing or expired. Ensure the frontend is initialized (Clerk session loaded) before making API calls. In dev, check that `CLERK_SECRET_KEY` is set in `Code/backend/.env`.

**401 on all requests after setting `CLERK_SECRET_KEY`** — Restart the backend after adding the key. The key is read at startup via `dotenv/config`.

**500 on first sign-in (new user)** — Migration 014 (`014_drop_auth_fkey.sql`) has not been run. The `users.id` FK to `auth.users` blocks insertion of Clerk-provisioned UUIDs. Run it in the Supabase SQL Editor.

**403 Forbidden** — The user's role doesn't meet the `requireRole()` threshold for that route. Check `ROLE_HIERARCHY` in `src/types/common.ts`.

**Blank page / redirect loop after sign-in** — Verify `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and the Clerk routing env vars (`NEXT_PUBLIC_CLERK_SIGN_IN_URL`, etc.) are set correctly in `Code/ui/.env.local`.

**"1 connector enabled" for a new account** — Old `activeConnectors` value in localStorage. Open browser console and run: `localStorage.removeItem('activeConnectors')` then refresh.

---

## Storage errors

**"File too large"** — Upload limit is 50 MB. Downloads are capped at 100 MB.

**"Bucket does not exist"** — Create the 4 buckets (`uploads`, `artifacts`, `media`, `downloads`) in Supabase Storage manually — they are not created by migrations.

**Signed URL expired** — Signed URLs expire in 15 minutes. Call `GET /api/v1/storage/sign/:path` to get a fresh one.

---

## Frontend

**Models not loading / conversations empty on first load** — Clerk session takes a moment to initialize after page load. The console page gates its initial data-fetch on `isLoaded && isSignedIn` from `useAuth()`. If this races, hard-reload the page.

**File upload not working** — Verify the backend is running and `NEXT_PUBLIC_API_URL` points to the correct port. If Next.js dev server auto-assigned a port other than 3000, add that port to `ALLOWED_ORIGINS` in the backend `.env`.

**SSE stream cuts off** — The backend timed out or the workflow failed. Check backend logs (`docker-compose logs backend`).

---

## CORS

**CORS error in browser console** — The frontend origin is not in `ALLOWED_ORIGINS`. Add it (comma-separated) and restart the backend. In production, set `ALLOWED_ORIGINS=https://app.yourdomain.com`.

---

## LLM Errors

**"Quota exceeded" in UI** — The active model's daily limit (per user) has been reached. Wait until UTC midnight for the counter to reset, or switch to a lower-tier model in Settings → Quality.

**"Service unavailable" in UI** — Google-side 503 (transient overload). The backend auto-retries up to 3× with 2s/4s/6s backoff. If it persists after retries, wait a few minutes and try again.

**Model responds with "I could not produce a final answer"** — Usually means the Gemini 2.5 model (a thinking model) returned only reasoning tokens (`thought: true` parts) with no text. This should be filtered automatically. If it recurs, check `lib/llm/gemini.ts` — ensure the `thought === true` part filter is present in the stream response loop.

**"I'll call the Kaggle API to answer..." on a math question** — The connector system prompt isn't preventing tool calls for general questions. Verify the `systemPrompt` in `lib/agents/orchestrator.ts` still contains "For general knowledge, math, coding, writing … answer DIRECTLY without calling any tool."

---

## Connectors

**Connector connect fails with "Invalid credentials"** — The test endpoint returned a definitive 401. Double-check that the API token/key is correct and has not expired.

**Connector connect appears to succeed but tool calls fail** — The connector was saved despite a soft-fail on test validation (404 or 503 from test endpoint). Verify the credentials manually against the provider's API docs.

**"encryptSecret is not a function"** — `INTEGRATION_ENCRYPTION_KEY` is missing from `.env`. Set a strong, stable value; changing it after credentials are stored will break decryption of existing credentials.

---

## Gemini 2.5 Specific

**`thinkingBudget` error in logs** — You are passing `thinkingConfig: { thinkingBudget: 0 }` to a Gemini 2.5 model. Budget 0 is invalid for thinking models. The provider conditionally omits `thinkingConfig` for models containing `"2.5"` in their ID — verify this logic is intact in `lib/llm/gemini.ts`.

**Empty assistant reply from Gemini 2.5** — Thinking tokens come back as `thought: true` parts in the response. If the filter is missing, those are counted as response text but contain no displayable content. The guard is `if ((part as unknown as Record<string, unknown>).thought === true) continue`.
