-- Add is_paused to match_state if it doesn't exist
ALTER TABLE match_state ADD COLUMN IF NOT EXISTS is_paused BOOLEAN DEFAULT false;
