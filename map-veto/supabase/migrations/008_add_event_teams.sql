-- Migration: Add event_teams table for team roster per event
-- This allows admins to reuse teams (name + logo) across matches within an event
-- Run this in your Supabase SQL Editor

-- Create the event_teams table
CREATE TABLE IF NOT EXISTS event_teams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    logo_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    -- Prevent duplicate team names within the same event
    UNIQUE(event_id, name)
);

-- Index for fast lookups by event
CREATE INDEX IF NOT EXISTS idx_event_teams_event_id ON event_teams(event_id);
