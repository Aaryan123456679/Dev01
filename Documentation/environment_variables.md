# Environment Variables

## Backend (`Code/backend/.env`)

All variables are required unless marked optional.

| Variable | Description | Example |
|---|---|---|
| `PORT` | HTTP server port | `8000` |
| `NODE_ENV` | `development` or `production` | `development` |
| `CLERK_SECRET_KEY` | Clerk secret key — used to verify JWTs on every request | `sk_test_...` |
| `SUPABASE_URL` | Supabase project URL | `https://abc.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key (bypasses RLS) | `eyJ...` |
| `SUPABASE_ANON_KEY` | Anon key (realtime subscriptions) | `eyJ...` |
| `GEMINI_API_KEY` | Google AI Studio API key | `AIza...` |
| `GEMINI_DEFAULT_MODEL` | Gemini model for generation | `gemini-flash-lite-latest` |
| `GEMINI_EMBEDDING_MODEL` | Gemini model for embeddings | `gemini-embedding-001` |
| `SANDBOX_PROVIDER` | `e2b` or `docker` | `e2b` |
| `E2B_API_KEY` | E2B API key (required if SANDBOX_PROVIDER=e2b) | `e2b_...` |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins | `http://localhost:3000` |
| `FRONTEND_URL` | Base URL of the frontend — used for OAuth redirect URIs | `http://localhost:3000` |
| `INTEGRATION_ENCRYPTION_KEY` | AES key for encrypting stored integration tokens at rest | *(long random string)* |
| `RATE_LIMIT_MAX` | Max requests per window per user | `60` |
| `RATE_LIMIT_WINDOW_MS` | Rate limit window in milliseconds | `60000` |

> **Warning:** Never expose `SUPABASE_SERVICE_ROLE_KEY` or `CLERK_SECRET_KEY` to the browser. Both bypass security controls.

> **Production:** Use `sk_live_...` for `CLERK_SECRET_KEY` and set `ALLOWED_ORIGINS` to your production frontend domain (e.g. `https://app.yourdomain.com`).

## Frontend (`Code/ui/.env.local`)

| Variable | Description | Example |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | Backend base URL | `http://localhost:8000` |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk publishable key (safe for browser) | `pk_test_...` |
| `CLERK_SECRET_KEY` | Clerk secret key — used server-side by Next.js middleware | `sk_test_...` |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | Sign-in page path | `/auth/login` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | Sign-up page path | `/auth/register` |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` | Redirect after sign-in | `/console` |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL` | Redirect after sign-up | `/console` |

> `CLERK_SECRET_KEY` appears in both frontend and backend envs. The frontend uses it only in Next.js server-side code (middleware). The backend uses it to verify JWTs.

## Auth Flow Summary

1. User signs in via Clerk (hosted UI embedded in `/auth/login` and `/auth/register`)
2. Clerk issues a short-lived JWT
3. Frontend attaches the JWT as `Authorization: Bearer <token>` on every API request
4. Backend calls `verifyToken(token, { secretKey: CLERK_SECRET_KEY })` to validate
5. On first sign-in, the backend auto-provisions a tenant + user row in Supabase (lazy provisioning)
6. Pre-Clerk users are linked by matching email address on first Clerk sign-in
