-- Migration: Add Ready Check / Check-in system
-- Both teams must ready up before the veto (coin toss) begins

-- 1. Add ready check columns to match_state
ALTER TABLE match_state
ADD COLUMN IF NOT EXISTS team_a_ready boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS team_b_ready boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS team_a_ready_at timestamptz,
ADD COLUMN IF NOT EXISTS team_b_ready_at timestamptz;

-- 2. Update the CHECK constraint on matches.status to include 'ready_check'
ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_status_check;
ALTER TABLE matches ADD CONSTRAINT matches_status_check
    CHECK (status IN ('ready_check', 'pending', 'coin_toss', 'side_selection', 'in_progress', 'completed', 'cancelled'));

-- 3. Update all existing 'coin_toss' matches to use the new initial status
-- (Only matches that haven't started yet — no coin toss winner)
UPDATE matches
SET status = 'ready_check'
WHERE status = 'coin_toss'
AND coin_toss_winner IS NULL;
