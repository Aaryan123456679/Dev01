-- ── Workflows ─────────────────────────────────────────────────────────────────
create table if not exists public.workflows (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants (id),
  user_id          uuid not null references public.users (id),
  conversation_id  uuid references public.conversations (id),
  name             text not null,
  state            text not null default 'pending'
                     check (state in ('pending','running','completed','failed','cancelled')),
  steps            jsonb not null default '[]'::jsonb,
  context_snapshot jsonb,
  result           jsonb,
  error            text,
  retry_count      int not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_workflows_tenant_state
  on public.workflows (tenant_id, state);

create index if not exists idx_workflows_conversation
  on public.workflows (conversation_id) where conversation_id is not null;

create trigger workflows_updated_at
  before update on public.workflows
  for each row execute function public.set_updated_at();

-- ── Sandbox Instances ─────────────────────────────────────────────────────────
create table if not exists public.sandbox_instances (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants (id),
  user_id             uuid not null references public.users (id),
  workflow_id         uuid references public.workflows (id),
  type                text not null default 'ephemeral'
                        check (type in ('ephemeral','dedicated')),
  state               text not null default 'CREATED'
                        check (state in (
                          'CREATED','CONTEXT_INJECTED','RUNNING',
                          'COMPLETED','FAILED','TERMINATED',
                          'EXPIRED','SNAPSHOT_SAVED'
                        )),
  provider            text not null default 'e2b'
                        check (provider in ('e2b','docker')),
  provider_sandbox_id text,
  resource_limits     jsonb not null default '{}'::jsonb,
  context_snapshot    jsonb,
  expires_at          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_sandbox_tenant_state
  on public.sandbox_instances (tenant_id, state);

create index if not exists idx_sandbox_expires
  on public.sandbox_instances (expires_at)
  where state not in ('TERMINATED','EXPIRED');

create trigger sandbox_instances_updated_at
  before update on public.sandbox_instances
  for each row execute function public.set_updated_at();
