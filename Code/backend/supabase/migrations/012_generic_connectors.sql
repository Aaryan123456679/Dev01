-- ── Generic connector support ─────────────────────────────────────────────────
-- Removes the 'notion'-only constraint from both integration tables so any
-- provider string is accepted. Adds a global connector registry that caches
-- discovery results (base URL, auth scheme, setup steps) per product.
--
-- Existing Notion rows are not touched; all foreign keys are intact.

-- 1. Widen the provider check constraints to allow any non-empty string.
alter table public.integration_connections
  drop constraint if exists integration_connections_provider_check;

alter table public.provider_app_configs
  drop constraint if exists provider_app_configs_provider_check;

-- 2. Global connector registry — one row per discovered product (shared across
--    all tenants; not user-specific). Discovery runs once; every subsequent user
--    who connects the same product reads from this cache.
create table if not exists public.connector_registry (
  id                   uuid primary key default gen_random_uuid(),
  normalized_name      text not null unique,        -- e.g. 'figma', 'medium'
  display_name         text not null,               -- e.g. 'Figma'
  connector_type       text not null default 'rest',-- 'rest' | 'mcp-http'
  has_official_mcp     boolean not null default false,
  base_url             text,                        -- e.g. 'https://api.figma.com/v1'
  auth_type            text not null default 'bearer', -- bearer | api-key | oauth2 | basic
  auth_header_name     text,                        -- e.g. 'X-Figma-Token'
  auth_header_format   text,                        -- e.g. '{token}' or 'Bearer {token}'
  required_credentials jsonb not null default '[]'::jsonb,
  -- [{name, label, description, secret}]
  setup_steps          jsonb not null default '[]'::jsonb,
  -- [string]
  documentation_url    text,
  discovery_metadata   jsonb not null default '{}'::jsonb,
  last_verified_at     timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create trigger connector_registry_updated_at
  before update on public.connector_registry
  for each row execute function public.set_updated_at();

-- Registry is global knowledge — any authenticated user can read it.
alter table public.connector_registry enable row level security;

create policy connector_registry_read on public.connector_registry
  for select using (auth.role() = 'authenticated');

-- Only service-role writes (backend uses service key).
create policy connector_registry_write on public.connector_registry
  for all using (auth.role() = 'service_role');
