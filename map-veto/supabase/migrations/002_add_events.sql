-- Migration: Add events table and event_id to matches
-- Run this in your Supabase SQL Editor to update an existing database

-- Create the events table for branding/grouping matches
CREATE TABLE IF NOT EXISTS events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    name VARCHAR(200) NOT NULL,
    logo_url TEXT,                    -- Header logo (replaces "MAP VETO"), recommended 200x50px
    coin_image_url TEXT,              -- Custom coin design, recommended 200x200px
    custom_font_url TEXT,             -- Custom font file (.woff2 or .ttf)
    custom_font_name VARCHAR(100),    -- Font family name to use in CSS
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add event_id column to matches table
ALTER TABLE matches ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES events(id) ON DELETE SET NULL;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_events_created_by ON events(created_by);
CREATE INDEX IF NOT EXISTS idx_matches_event_id ON matches(event_id);
