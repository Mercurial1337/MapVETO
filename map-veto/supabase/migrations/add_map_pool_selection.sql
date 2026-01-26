-- Migration: Add map pool selection to matches
-- Run this in Supabase SQL Editor for existing databases

-- Add map_pool_type column to control which maps are available
ALTER TABLE matches 
ADD COLUMN IF NOT EXISTS map_pool_type VARCHAR(20) DEFAULT 'competitive' 
    CHECK (map_pool_type IN ('competitive', 'all', 'custom'));

-- Add custom_maps column to store custom map selection
ALTER TABLE matches 
ADD COLUMN IF NOT EXISTS custom_maps JSONB DEFAULT NULL;

-- Add comment
COMMENT ON COLUMN matches.map_pool_type IS 'Type of map pool: competitive (7 maps), all (12 maps), or custom';
COMMENT ON COLUMN matches.custom_maps IS 'Array of map names for custom pool, e.g. ["Abyss", "Bind", "Haven"]';
