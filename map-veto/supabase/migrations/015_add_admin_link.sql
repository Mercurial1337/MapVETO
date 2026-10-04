-- Find the generated constraint name for link_type and drop it
DO $$ 
DECLARE 
    constraint_name text;
BEGIN
    SELECT conname INTO constraint_name
    FROM pg_constraint
    WHERE conrelid = 'match_links'::regclass 
    AND contype = 'c' 
    AND pg_get_constraintdef(oid) LIKE '%link_type%';

    IF constraint_name IS NOT NULL THEN
        EXECUTE 'ALTER TABLE match_links DROP CONSTRAINT ' || constraint_name;
    END IF;
END $$;

-- Add new constraint allowing 'admin'
ALTER TABLE match_links ADD CONSTRAINT match_links_link_type_check CHECK (link_type IN ('team_a', 'team_b', 'observer', 'admin'));

-- Update the match creation trigger to also generate an admin link
CREATE OR REPLACE FUNCTION create_match_state_and_links()
RETURNS TRIGGER AS $$
DECLARE
    v_pool_id UUID;
    v_map_ids JSONB;
BEGIN
    -- Get the map pool for this match's tournament or use default
    SELECT mp.id INTO v_pool_id
    FROM tournaments t
    JOIN map_pools mp ON mp.id = t.map_pool_id
    WHERE t.id = NEW.tournament_id;
    
    -- If no tournament pool, get default pool for the game
    IF v_pool_id IS NULL THEN
        SELECT mp.id INTO v_pool_id
        FROM veto_templates vt
        JOIN map_pools mp ON mp.game_id = vt.game_id AND mp.is_default = true
        WHERE vt.id = NEW.veto_template_id;
    END IF;
    
    -- Get all map IDs from the pool
    SELECT COALESCE(jsonb_agg(pm.map_id ORDER BY pm.display_order), '[]'::jsonb) INTO v_map_ids
    FROM pool_maps pm
    WHERE pm.pool_id = v_pool_id;
    
    -- Create match state
    INSERT INTO match_state (match_id, current_step, current_turn, available_maps)
    VALUES (NEW.id, 0, 'team_a', v_map_ids);
    
    -- Create magic links
    INSERT INTO match_links (match_id, link_type) VALUES
        (NEW.id, 'team_a'),
        (NEW.id, 'team_b'),
        (NEW.id, 'observer'),
        (NEW.id, 'admin');
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Generate admin links for existing matches
INSERT INTO match_links (match_id, link_type)
SELECT id, 'admin' FROM matches
ON CONFLICT DO NOTHING;
