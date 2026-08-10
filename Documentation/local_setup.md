# Local Setup Guide

## Prerequisites

- Node.js v20+ (or Docker Desktop)
- A [Supabase](https://supabase.com) account (free tier is fine) — database only, auth is handled by Clerk
- A [Clerk](https://clerk.com) account (free tier is fine)
- A [Google AI Studio](https://aistudio.google.com) account (free Gemini API key)
- An [E2B](https://e2b.dev) account (free 100h/month sandbox quota)

---

## Step 1 — Supabase Project (database only)

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**
2. Choose a region close to you, set a strong database password
3. After project creates, go to **Settings → API** and copy:
   - `Project URL` → `SUPABASE_URL`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`  *(keep secret, never expose to browser)*
   - `anon` key → `SUPABASE_ANON_KEY`

> Supabase Auth is **not used**. Supabase is used only as a Postgres database + object storage host.

---

## Step 2 — Run Migrations

In the Supabase dashboard, go to **SQL Editor** and run the migration files **in order**:

```
Code/backend/supabase/migrations/001_tenants_users.sql
Code/backend/supabase/migrations/002_sessions_conversations.sql
Code/backend/supabase/migrations/003_workflows_sandboxes.sql
Code/backend/supabase/migrations/004_artifacts_storage.sql
Code/backend/supabase/migrations/005_mcp_providers.sql
Code/backend/supabase/migrations/006_media_downloads.sql
Code/backend/supabase/migrations/007_audit_logs.sql
Code/backend/supabase/migrations/008_rls_policies.sql
Code/backend/supabase/migrations/009_cron.sql
Code/backend/supabase/migrations/013_clerk_users.sql
Code/backend/supabase/migrations/014_drop_auth_fkey.sql
```

> **Note on 009:** This requires the `pg_cron` extension. Enable it first: **Database → Extensions → pg_cron → Enable**.
>
> **Note on 013 + 014:** These add the `clerk_user_id` column and drop the legacy `auth.users` foreign key. Both are required before any user can sign in.

---

## Step 3 — Create Storage Buckets

In Supabase dashboard, go to **Storage → New bucket** and create these 4 buckets (all **private**):

| Bucket name | File size limit |
|---|---|
| `uploads` | 50 MB |
| `artifacts` | 200 MB |
| `media` | 200 MB |
| `downloads` | 100 MB |

---

## Step 4 — Clerk Application

1. Go to [dashboard.clerk.com](https://dashboard.clerk.com) → **Create application**
2. Choose your preferred sign-in methods (Email + Password is the minimum)
3. From **API Keys**, copy:
   - `Publishable key` → `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
   - `Secret key` → `CLERK_SECRET_KEY` (needed in **both** frontend and backend envs)

---

## Step 5 — Get Other API Keys

**Gemini:**
1. Go to [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
2. Create a key → copy to `GEMINI_API_KEY`

**E2B:**
1. Go to [e2b.dev/dashboard](https://e2b.dev/dashboard) → API Keys
2. Create a key → copy to `E2B_API_KEY`

---

## Step 6 — Configure Environment

**Backend** (`Code/backend/.env`):
```bash
PORT=8000
NODE_ENV=development

# Clerk
CLERK_SECRET_KEY=sk_test_...

# Supabase (database + storage only)
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SUPABASE_ANON_KEY=eyJ...

# Gemini
GEMINI_API_KEY=AIza...
GEMINI_DEFAULT_MODEL=gemini-flash-lite-latest
GEMINI_EMBEDDING_MODEL=gemini-embedding-001

# E2B
SANDBOX_PROVIDER=e2b
E2B_API_KEY=e2b_...

# CORS — must include your frontend origin
ALLOWED_ORIGINS=http://localhost:3000

FRONTEND_URL=http://localhost:3000
INTEGRATION_ENCRYPTION_KEY=change-me-to-a-long-random-string
```

**Frontend** (`Code/ui/.env.local`):
```bash
NEXT_PUBLIC_API_URL=http://localhost:8000

# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...

# Clerk routing
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/auth/login
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/auth/register
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/console
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/console
```

---

## Step 7 — Run with Docker Compose

```bash
cd Code
docker-compose up --build
```

- **Frontend**: http://localhost:3000
- **Backend health**: http://localhost:8000/health

---

## Alternative: Run Without Docker

**Backend:**
```bash
cd Code/backend
npm install
cp .env.example .env   # fill in real values
npm run dev            # tsx watch src/index.ts
```

**Frontend:**
```bash
cd Code/ui
npm install
cp .env.local.example .env.local   # fill in real values
npm run dev
```

> If Next.js auto-assigns a port other than 3000 (e.g. 3001), add that port to `ALLOWED_ORIGINS` in the backend `.env`.

---

## First Use

1. Open http://localhost:3000 → redirected to `/auth/login`
2. Click **Sign up** → register with email + password via Clerk
3. On first sign-in, a tenant and user row are automatically provisioned in the database
4. You are redirected to `/console`
5. Type a prompt and press **Enter** or **Run**

> **Pre-existing users** (created before the Clerk migration): sign in with the same email — your account is linked to Clerk automatically on first sign-in.

---

## Troubleshooting

See [troubleshooting.md](troubleshooting.md).
