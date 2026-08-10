-- Requires pg_cron extension (enable in Supabase dashboard under Extensions)
-- Schedule: expire sandboxes that have been running beyond their quota timeout

SELECT cron.schedule(
  'expire-stale-sandboxes',
  '*/5 * * * *',  -- every 5 minutes
  $$
    UPDATE public.sandbox_instances
    SET
      state       = 'TERMINATED',
      terminated_at = NOW()
    WHERE
      state NOT IN ('TERMINATED', 'COMPLETED', 'FAILED')
      AND started_at IS NOT NULL
      AND started_at < NOW() - INTERVAL '10 minutes';
  $$
);

-- Schedule: clean up soft-deleted conversations older than 30 days
SELECT cron.schedule(
  'purge-deleted-conversations',
  '0 3 * * *',  -- daily at 03:00 UTC
  $$
    DELETE FROM public.conversations
    WHERE deleted_at IS NOT NULL
      AND deleted_at < NOW() - INTERVAL '30 days';
  $$
);
