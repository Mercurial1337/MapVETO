-- Add metadata column to match_logs if it doesn't exist
ALTER TABLE match_logs ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT NULL;
