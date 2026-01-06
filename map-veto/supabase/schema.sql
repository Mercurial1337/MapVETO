-- =============================================
-- Map VETO Management System - Database Schema
-- PostgreSQL for Supabase
-- =============================================

-- RESET (Drop existing tables to start fresh)
DROP TABLE IF EXISTS match_logs CASCADE;
DROP TABLE IF EXISTS match_links CASCADE;
DROP TABLE IF EXISTS match_state CASCADE;
DROP TABLE IF EXISTS matches CASCADE;
DROP TABLE IF EXISTS tournaments CASCADE;
DROP TABLE IF EXISTS veto_templates CASCADE;
DROP TABLE IF EXISTS pool_maps CASCADE;
DROP TABLE IF EXISTS map_pools CASCADE;
DROP TABLE IF EXISTS maps CASCADE;
DROP TABLE IF EXISTS games CASCADE;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- Core Tables
-- =============================================

-- Games table (supports multiple games: Valorant, CS2, etc.)
CREATE TABLE games (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(50) NOT NULL UNIQUE,
    logo_url TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Maps table
CREATE TABLE maps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(50) NOT NULL,
    image_url TEXT NOT NULL,
    callout_image_url TEXT,
    is_active BOOLEAN DEFAULT true,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(game_id, slug)
);

-- Map Pools table
CREATE TABLE map_pools (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    is_default BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pool Maps junction table
CREATE TABLE pool_maps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pool_id UUID NOT NULL REFERENCES map_pools(id) ON DELETE CASCADE,
    map_id UUID NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
    display_order INT NOT NULL DEFAULT 0,
    UNIQUE(pool_id, map_id)
);

-- Veto Templates table
CREATE TABLE veto_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    format VARCHAR(10) NOT NULL CHECK (format IN ('bo1', 'bo3', 'bo5')),
    sequence JSONB NOT NULL,
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tournaments table
CREATE TABLE tournaments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    map_pool_id UUID REFERENCES map_pools(id),
    name VARCHAR(200) NOT NULL,
    google_sheet_id VARCHAR(100),
    metadata JSONB DEFAULT '{}',
    start_date DATE,
    end_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Matches table
CREATE TABLE matches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE,
    veto_template_id UUID NOT NULL REFERENCES veto_templates(id),
    team_a_name VARCHAR(100) NOT NULL,
    team_a_logo TEXT,
    team_b_name VARCHAR(100) NOT NULL,
    team_b_logo TEXT,
    format VARCHAR(10) NOT NULL CHECK (format IN ('bo1', 'bo3', 'bo5')),
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'coin_toss', 'in_progress', 'completed', 'cancelled')),
    coin_toss_winner VARCHAR(10) CHECK (coin_toss_winner IN ('team_a', 'team_b')),
    scheduled_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Match State table (realtime updates)
CREATE TABLE match_state (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    match_id UUID NOT NULL UNIQUE REFERENCES matches(id) ON DELETE CASCADE,
    current_step INT NOT NULL DEFAULT 0,
    current_turn VARCHAR(10) CHECK (current_turn IN ('team_a', 'team_b', 'system')),
    available_maps JSONB NOT NULL DEFAULT '[]',
    banned_maps JSONB NOT NULL DEFAULT '[]',
    picked_maps JSONB NOT NULL DEFAULT '[]',
    results JSONB NOT NULL DEFAULT '[]',
    is_complete BOOLEAN DEFAULT false,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Match Links table (magic links)
CREATE TABLE match_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    link_type VARCHAR(20) NOT NULL CHECK (link_type IN ('team_a', 'team_b', 'observer')),
    token UUID NOT NULL UNIQUE DEFAULT uuid_generate_v4(),
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(match_id, link_type)
);

-- Match Logs table
CREATE TABLE match_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    step_number INT NOT NULL,
    action_type VARCHAR(20) NOT NULL,
    actor VARCHAR(10) NOT NULL,
    map_id UUID REFERENCES maps(id),
    side_choice VARCHAR(10) CHECK (side_choice IN ('attack', 'defense')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- Row Level Security
-- =============================================

ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_logs ENABLE ROW LEVEL SECURITY;

-- Public read access for matches (needed for observer view)
CREATE POLICY "Matches are publicly readable" ON matches
    FOR SELECT USING (true);

-- Public read access for match state
CREATE POLICY "Match state is publicly readable" ON match_state
    FOR SELECT USING (true);

-- Match links readable for token validation
CREATE POLICY "Match links readable for validation" ON match_links
    FOR SELECT USING (true);

-- Match logs are publicly readable
CREATE POLICY "Match logs are publicly readable" ON match_logs
    FOR SELECT USING (true);

-- Service role has full access (for API routes)
CREATE POLICY "Service role full access matches" ON matches
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access match_state" ON match_state
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access match_links" ON match_links
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access match_logs" ON match_logs
    FOR ALL USING (auth.role() = 'service_role');

-- =============================================
-- Indexes for Performance
-- =============================================

CREATE INDEX idx_maps_game_id ON maps(game_id);
CREATE INDEX idx_maps_slug ON maps(slug);
CREATE INDEX idx_pool_maps_pool_id ON pool_maps(pool_id);
CREATE INDEX idx_matches_tournament_id ON matches(tournament_id);
CREATE INDEX idx_matches_status ON matches(status);
CREATE INDEX idx_match_state_match_id ON match_state(match_id);
CREATE INDEX idx_match_links_token ON match_links(token);
CREATE INDEX idx_match_links_match_id ON match_links(match_id);
CREATE INDEX idx_match_logs_match_id ON match_logs(match_id);

-- =============================================
-- Functions for Triggers
-- =============================================

-- Function to update match_state.updated_at
CREATE OR REPLACE FUNCTION update_match_state_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_match_state_timestamp
    BEFORE UPDATE ON match_state
    FOR EACH ROW
    EXECUTE FUNCTION update_match_state_timestamp();

-- Function to create match state and links when match is created
CREATE OR REPLACE FUNCTION create_match_state_and_links()
RETURNS TRIGGER AS $$
DECLARE
    pool_id UUID;
    map_ids JSONB;
BEGIN
    -- Get the map pool for this match's tournament or use default
    SELECT mp.id INTO pool_id
    FROM tournaments t
    JOIN map_pools mp ON mp.id = t.map_pool_id
    WHERE t.id = NEW.tournament_id;
    
    -- If no tournament pool, get default pool for the game
    IF pool_id IS NULL THEN
        SELECT mp.id INTO pool_id
        FROM veto_templates vt
        JOIN map_pools mp ON mp.game_id = vt.game_id AND mp.is_default = true
        WHERE vt.id = NEW.veto_template_id;
    END IF;
    
    -- Get all map IDs from the pool
    SELECT COALESCE(jsonb_agg(pm.map_id ORDER BY pm.display_order), '[]'::jsonb) INTO map_ids
    FROM pool_maps pm
    WHERE pm.pool_id = pool_id;
    
    -- Create match state
    INSERT INTO match_state (match_id, current_step, current_turn, available_maps)
    VALUES (NEW.id, 0, 'team_a', map_ids);
    
    -- Create magic links
    INSERT INTO match_links (match_id, link_type) VALUES
        (NEW.id, 'team_a'),
        (NEW.id, 'team_b'),
        (NEW.id, 'observer');
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_create_match_state_and_links
    AFTER INSERT ON matches
    FOR EACH ROW
    EXECUTE FUNCTION create_match_state_and_links();

-- =============================================
-- Seed Data: Valorant
-- =============================================

-- Insert Valorant game
INSERT INTO games (name, slug, logo_url) VALUES
('Valorant', 'valorant', '/games/valorant-logo.png');

-- Insert Valorant maps
INSERT INTO maps (game_id, name, slug, image_url) VALUES
((SELECT id FROM games WHERE slug = 'valorant'), 'Abyss', 'abyss', '/maps/valorant/abyss.webp'),
((SELECT id FROM games WHERE slug = 'valorant'), 'Bind', 'bind', '/maps/valorant/bind.webp'),
((SELECT id FROM games WHERE slug = 'valorant'), 'Haven', 'haven', '/maps/valorant/haven.webp'),
((SELECT id FROM games WHERE slug = 'valorant'), 'Pearl', 'pearl', '/maps/valorant/pearl.webp'),
((SELECT id FROM games WHERE slug = 'valorant'), 'Corrode', 'corrode', '/maps/valorant/corrode.webp'),
((SELECT id FROM games WHERE slug = 'valorant'), 'Split', 'split', '/maps/valorant/split.webp'),
((SELECT id FROM games WHERE slug = 'valorant'), 'Sunset', 'sunset', '/maps/valorant/sunset.webp');

-- Create default map pool
INSERT INTO map_pools (game_id, name, description, is_default) VALUES
((SELECT id FROM games WHERE slug = 'valorant'), 'Valorant Competitive Pool', 'Default 7-map competitive pool', true);

-- Add all maps to the default pool
INSERT INTO pool_maps (pool_id, map_id, display_order)
SELECT 
    (SELECT id FROM map_pools WHERE name = 'Valorant Competitive Pool'),
    id,
    ROW_NUMBER() OVER (ORDER BY name)
FROM maps WHERE game_id = (SELECT id FROM games WHERE slug = 'valorant');

-- Insert Bo3 Standard template
INSERT INTO veto_templates (game_id, name, format, is_default, sequence) VALUES
((SELECT id FROM games WHERE slug = 'valorant'), 'Bo3 Standard', 'bo3', true, '{
  "format": "bo3",
  "total_steps": 10,
  "steps": [
    {"step": 1, "action": "ban", "actor": "team_a", "description": "Team A bans a map"},
    {"step": 2, "action": "ban", "actor": "team_b", "description": "Team B bans a map"},
    {"step": 3, "action": "pick", "actor": "team_a", "map_number": 1, "description": "Team A picks Map 1"},
    {"step": 4, "action": "side", "actor": "team_b", "map_number": 1, "description": "Team B picks side for Map 1"},
    {"step": 5, "action": "pick", "actor": "team_b", "map_number": 2, "description": "Team B picks Map 2"},
    {"step": 6, "action": "side", "actor": "team_a", "map_number": 2, "description": "Team A picks side for Map 2"},
    {"step": 7, "action": "ban", "actor": "team_a", "description": "Team A bans a map"},
    {"step": 8, "action": "ban", "actor": "team_b", "description": "Team B bans a map"},
    {"step": 9, "action": "decider", "actor": "system", "map_number": 3, "description": "Remaining map is decider"},
    {"step": 10, "action": "side", "actor": "team_a", "map_number": 3, "description": "Team A picks side for Map 3"}
  ]
}'::jsonb);

-- Insert Bo5 Grand Finals template
INSERT INTO veto_templates (game_id, name, format, sequence) VALUES
((SELECT id FROM games WHERE slug = 'valorant'), 'Bo5 Grand Finals', 'bo5', '{
  "format": "bo5",
  "total_steps": 11,
  "winner_bracket_team": "team_a",
  "steps": [
    {"step": 1, "action": "ban", "actor": "team_a", "count": 2, "description": "Winners Bracket Team bans 2 maps"},
    {"step": 2, "action": "pick", "actor": "team_a", "map_number": 1, "description": "Team A picks Map 1"},
    {"step": 3, "action": "side", "actor": "team_b", "map_number": 1, "description": "Team B picks side for Map 1"},
    {"step": 4, "action": "pick", "actor": "team_b", "map_number": 2, "description": "Team B picks Map 2"},
    {"step": 5, "action": "side", "actor": "team_a", "map_number": 2, "description": "Team A picks side for Map 2"},
    {"step": 6, "action": "pick", "actor": "team_a", "map_number": 3, "description": "Team A picks Map 3"},
    {"step": 7, "action": "side", "actor": "team_b", "map_number": 3, "description": "Team B picks side for Map 3"},
    {"step": 8, "action": "pick", "actor": "team_b", "map_number": 4, "description": "Team B picks Map 4"},
    {"step": 9, "action": "side", "actor": "team_a", "map_number": 4, "description": "Team A picks side for Map 4"},
    {"step": 10, "action": "decider", "actor": "system", "map_number": 5, "description": "Remaining map is decider"},
    {"step": 11, "action": "side", "actor": "team_b", "map_number": 5, "description": "Team B picks side for Map 5"}
  ]
}'::jsonb);

-- Insert Bo1 Standard template
INSERT INTO veto_templates (game_id, name, format, sequence) VALUES
((SELECT id FROM games WHERE slug = 'valorant'), 'Bo1 Standard', 'bo1', '{
  "format": "bo1",
  "total_steps": 7,
  "steps": [
    {"step": 1, "action": "ban", "actor": "team_a", "description": "Team A bans a map"},
    {"step": 2, "action": "ban", "actor": "team_b", "description": "Team B bans a map"},
    {"step": 3, "action": "ban", "actor": "team_a", "description": "Team A bans a map"},
    {"step": 4, "action": "ban", "actor": "team_b", "description": "Team B bans a map"},
    {"step": 5, "action": "ban", "actor": "team_a", "description": "Team A bans a map"},
    {"step": 6, "action": "ban", "actor": "team_b", "description": "Team B bans a map"},
    {"step": 7, "action": "decider", "actor": "system", "map_number": 1, "description": "Remaining map is played"}
  ]
}'::jsonb);

-- =============================================
-- Enable Realtime
-- =============================================

ALTER PUBLICATION supabase_realtime ADD TABLE match_state;
ALTER PUBLICATION supabase_realtime ADD TABLE matches;
