// Deno Edge Function — invoked by pg_cron or Supabase scheduled trigger
// Terminates sandbox instances that exceed their quota timeout

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

Deno.serve(async (_req: Request) => {
  const supabase = createClient(supabaseUrl, serviceRoleKey)

  const { data, error } = await supabase
    .from('sandbox_instances')
    .update({ state: 'TERMINATED', terminated_at: new Date().toISOString() })
    .in('state', ['CREATED', 'CONTEXT_INJECTED', 'RUNNING'])
    .lt('started_at', new Date(Date.now() - 10 * 60 * 1000).toISOString())
    .select('id')

  if (error) {
    console.error('sandbox-expire error:', error.message)
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  const terminated = data?.length ?? 0
  console.log(`sandbox-expire: terminated ${terminated} stale instances`)

  return new Response(JSON.stringify({ terminated }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
