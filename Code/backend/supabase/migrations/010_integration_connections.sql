-- ── Integration connections ──────────────────────────────────────────────────
-- Per-user OAuth connections to third-party apps (e.g. Notion). Access tokens
-- are encrypted at rest by the application before being stored here.
create table if not exists public.integration_connections (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants (id) on delete cascade,
  user_id         uuid not null references public.users (id) on delete cascade,
  provider        text not null check (provider in ('notion')),
  access_token    text not null,                -- AES-256-GCM ciphertext (iv:tag:data)
  refresh_token   text,                         -- ciphertext, when the provider issues one
  account_label   text,                         -- e.g. Notion workspace name
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (tenant_id, user_id, provider)
);

create index if not exists idx_integration_conn_user
  on public.integration_connections (tenant_id, user_id);

create trigger integration_connections_updated_at
  before update on public.integration_connections
  for each row execute function public.set_updated_at();

-- RLS: a user sees only their own connections within their tenant.
alter table public.integration_connections enable row level security;

create policy integration_conn_select on public.integration_connections
  for select using (user_id = auth.uid());

create policy integration_conn_modify on public.integration_connections
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
