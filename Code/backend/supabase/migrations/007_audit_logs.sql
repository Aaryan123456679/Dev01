CREATE TABLE IF NOT EXISTS public.audit_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  action       TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id  TEXT,
  metadata     JSONB,
  ip_address   INET,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_id   ON public.audit_logs (tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id     ON public.audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action      ON public.audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at  ON public.audit_logs (created_at DESC);

-- Partition hint: in production, partition by created_at (monthly) and set a retention policy.
-- Rows are append-only; no UPDATE or DELETE from application code.

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Only service-role key (backend) writes audit logs; no direct user access
CREATE POLICY "audit_logs_service_only" ON public.audit_logs
  FOR ALL USING (false);
