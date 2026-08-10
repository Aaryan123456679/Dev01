-- ── Conversations ─────────────────────────────────────────────────────────────
create table if not exists public.conversations (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users (id) on delete cascade,
  tenant_id  uuid not null references public.tenants (id),
  title      text,
  messages   jsonb not null default '[]'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_conversations_user_tenant
  on public.conversations (user_id, tenant_id);

create index if not exists idx_conversations_tenant_updated
  on public.conversations (tenant_id, updated_at desc)
  where deleted_at is null;

create trigger conversations_updated_at
  before update on public.conversations
  for each row execute function public.set_updated_at();
