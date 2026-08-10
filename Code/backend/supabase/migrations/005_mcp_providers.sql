-- ── MCP Providers ─────────────────────────────────────────────────────────────
create table if not exists public.mcp_providers (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid references public.tenants (id),  -- null = global provider
  name         text not null,
  category     text not null
                 check (category in (
                   'llm','vision','speech','ocr','embeddings',
                   'storage','sandbox','media','download','file'
                 )),
  version      text not null default '1.0.0',
  config       jsonb not null default '{}'::jsonb,
  capabilities jsonb not null default '[]'::jsonb,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_mcp_providers_category
  on public.mcp_providers (category, is_active);

create index if not exists idx_mcp_providers_tenant
  on public.mcp_providers (tenant_id) where tenant_id is not null;

create trigger mcp_providers_updated_at
  before update on public.mcp_providers
  for each row execute function public.set_updated_at();

-- Seed global Gemini LLM provider record
insert into public.mcp_providers (name, category, version, capabilities)
values (
  'gemini-llm',
  'llm',
  '1.0.0',
  '[{"name":"llm.generate"},{"name":"llm.stream"},{"name":"llm.embeddings"}]'::jsonb
) on conflict do nothing;
