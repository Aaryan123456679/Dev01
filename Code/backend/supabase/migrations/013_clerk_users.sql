-- Add Clerk user ID column so we can map Clerk sessions to DB users.
ALTER TABLE users ADD COLUMN IF NOT EXISTS clerk_user_id VARCHAR(255) UNIQUE;
CREATE INDEX IF NOT EXISTS idx_users_clerk_user_id ON users(clerk_user_id);
