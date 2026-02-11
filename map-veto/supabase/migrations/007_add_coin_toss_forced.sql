-- Add coin_toss_forced column to matches table
-- This tracks whether the coin toss winner was forced by admin (seeded match)
-- When true, the coin flip animation is skipped for all viewers
ALTER TABLE matches ADD COLUMN IF NOT EXISTS coin_toss_forced BOOLEAN NOT NULL DEFAULT false;
