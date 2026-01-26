-- Migration: Add custom_veto_sequence to matches
ALTER TABLE matches ADD COLUMN custom_veto_sequence JSONB DEFAULT NULL;
