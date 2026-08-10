-- ── Row Level Security ────────────────────────────────────────────────────────
-- The backend always uses the service-role key (bypasses RLS).
-- These policies are a second line of defence for:
--   1. Direct Supabase dashboard access
--   2. Any future anon/user-key client usage

-- Enable RLS on all tenant-scoped tables
alter table public.tenants           enable row level security;
alter table public.users             enable row level security;
alter table public.sessions          enable row level security;
alter table public.conversations     enable row level security;
alter table public.workflows         enable row level security;
alter table public.sandbox_instances enable row level security;
alter table public.artifacts         enable row level security;
alter table public.mcp_providers     enable row level security;
alter table public.audit_logs        enable row level security;

-- Helper: get the authenticated user's tenant_id
create or replace function public.auth_tenant_id()
returns uuid language sql stable as $$
  select tenant_id from public.users where id = auth.uid()
$$;

-- ── Users: can only see own tenant ───────────────────────────────────────────
create policy "users_tenant_isolation" on public.users
  using (tenant_id = public.auth_tenant_id());

-- ── Conversations: tenant isolation ──────────────────────────────────────────
create policy "conversations_tenant_isolation" on public.conversations
  using (tenant_id = public.auth_tenant_id());

-- ── Workflows: tenant isolation ───────────────────────────────────────────────
create policy "workflows_tenant_isolation" on public.workflows
  using (tenant_id = public.auth_tenant_id());

-- ── Sandbox instances: tenant isolation ───────────────────────────────────────
create policy "sandbox_tenant_isolation" on public.sandbox_instances
  using (tenant_id = public.auth_tenant_id());

-- ── Artifacts: tenant isolation ───────────────────────────────────────────────
create policy "artifacts_tenant_isolation" on public.artifacts
  using (tenant_id = public.auth_tenant_id());

-- ── MCP providers: global or tenant-specific ─────────────────────────────────
create policy "mcp_providers_access" on public.mcp_providers
  using (tenant_id is null or tenant_id = public.auth_tenant_id());

-- ── Audit logs: tenant isolation, append-only (no update/delete) ──────────────
create policy "audit_logs_select" on public.audit_logs
  for select using (tenant_id = public.auth_tenant_id());

create policy "audit_logs_insert" on public.audit_logs
  for insert with check (tenant_id = public.auth_tenant_id());
-- No UPDATE or DELETE policies — audit logs are immutable.
