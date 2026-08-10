-- Drop the Supabase auth FK — users are now identified by Clerk, not auth.users
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_id_fkey;

-- Remove orphaned tenants left by failed Clerk provisioning attempts
DELETE FROM tenants WHERE id NOT IN (SELECT DISTINCT tenant_id FROM users WHERE tenant_id IS NOT NULL);
