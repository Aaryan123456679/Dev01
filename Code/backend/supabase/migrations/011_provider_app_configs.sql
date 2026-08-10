-- ── Provider app configs ──────────────────────────────────────────────────────
-- Per-tenant OAuth *app* credentials (client id/secret) for third-party
-- providers, so a workspace admin can configure integrations from the UI instead
-- of editing the backend .env. The client secret is encrypted at rest.
create table if not exists public.provider_app_configs (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants (id) on delete cascade,
  provider        text not null check (provider in ('notion')),
  client_id       text not null,
  client_secret   text not null,            -- AES-256-GCM ciphertext
  redirect_uri    text not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (tenant_id, provider)
);

create trigger provider_app_configs_updated_at
  before update on public.provider_app_configs
  for each row execute function public.set_updated_at();

alter table public.provider_app_configs enable row level security;

-- Any authenticated member of the tenant may read/write their tenant's config
-- (the route layer additionally restricts writes to admins).
create policy provider_cfg_rw on public.provider_app_configs
  for all using (
    tenant_id in (select tenant_id from public.users where id = auth.uid())
  ) with check (
    tenant_id in (select tenant_id from public.users where id = auth.uid())
  );
