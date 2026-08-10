-- ── Artifacts ─────────────────────────────────────────────────────────────────
create table if not exists public.artifacts (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id),
  user_id       uuid not null references public.users (id),
  sandbox_id    uuid references public.sandbox_instances (id),
  workflow_id   uuid references public.workflows (id),
  storage_path  text not null,
  artifact_type text not null
                  check (artifact_type in
                    ('file','code','image','video','audio','document','snapshot')),
  mime_type     text,
  size_bytes    bigint,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists idx_artifacts_tenant_user
  on public.artifacts (tenant_id, user_id);

create index if not exists idx_artifacts_sandbox
  on public.artifacts (sandbox_id) where sandbox_id is not null;

create index if not exists idx_artifacts_workflow
  on public.artifacts (workflow_id) where workflow_id is not null;
