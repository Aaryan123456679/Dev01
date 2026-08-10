-- ── Tenants ───────────────────────────────────────────────────────────────────
create table if not exists public.tenants (
  id         uuid primary key default gen_random_uuid(),
  name       text unique not null,
  plan_type  text not null default 'free'
               check (plan_type in ('free', 'standard', 'power', 'enterprise')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Users (extends Supabase auth.users — same UUID) ───────────────────────────
create table if not exists public.users (
  id         uuid primary key references auth.users (id) on delete cascade,
  tenant_id  uuid not null references public.tenants (id),
  email      text not null,
  role       text not null default 'standard'
               check (role in ('admin', 'power', 'standard', 'readonly')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_users_tenant_id on public.users (tenant_id);
create index if not exists idx_users_email     on public.users (email);

-- ── Sessions (revocation list — NOT an active-session store) ─────────────────
-- A row means the token has been revoked (user logged out).
create table if not exists public.sessions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_sessions_token_hash on public.sessions (token_hash);
create index if not exists idx_sessions_user_id    on public.sessions (user_id);

-- Automatically remove expired revocation entries (cleanup job or pg_cron)
-- Rows past expires_at are safe to delete; the JWT itself is also expired.

-- ── updated_at trigger ────────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger tenants_updated_at
  before update on public.tenants
  for each row execute function public.set_updated_at();

create trigger users_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();
