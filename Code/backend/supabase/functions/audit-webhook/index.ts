// Deno Edge Function — invoked by Supabase DB webhook on INSERT to audit_logs
// Can forward events to external SIEM, Slack, or alerting systems

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ALERT_ACTIONS = new Set(['auth.logout_forced', 'tenant.deleted', 'quota.exceeded'])

interface AuditPayload {
  type: 'INSERT'
  table: string
  record: {
    id: string
    tenant_id: string
    user_id: string
    action: string
    resource_type: string
    resource_id: string | null
    metadata: Record<string, unknown> | null
    ip_address: string | null
    created_at: string
  }
}

Deno.serve(async (req: Request) => {
  let payload: AuditPayload
  try {
    payload = await req.json()
  } catch {
    return new Response('Bad Request', { status: 400 })
  }

  const { record } = payload

  // Forward high-severity events to external webhook if configured
  const webhookUrl = Deno.env.get('AUDIT_ALERT_WEBHOOK_URL')
  if (webhookUrl && ALERT_ACTIONS.has(record.action)) {
    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `[AUDIT ALERT] ${record.action} by user ${record.user_id} in tenant ${record.tenant_id}`,
          record,
        }),
      })
    } catch (err) {
      console.error('audit-webhook: alert forward failed', err)
    }
  }

  console.log(`audit-webhook: processed ${record.action} (${record.id})`)
  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
