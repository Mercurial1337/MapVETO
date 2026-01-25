-- Migration: Add created_by column to matches table
-- Run this in your Supabase SQL Editor to update an existing database

-- Add the created_by column
ALTER TABLE matches 
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Create index for better query performance when filtering by created_by
CREATE INDEX IF NOT EXISTS idx_matches_created_by ON matches(created_by);
