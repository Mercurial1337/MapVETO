-- Migration: Add missing Valorant maps
-- Maps to add: Ascent, Icebox, Breeze, Fracture, Lotus

DO $$ 
DECLARE
    v_val_id UUID;
BEGIN
    -- Get Valorant game ID
    SELECT id INTO v_val_id FROM games WHERE slug = 'valorant';

    IF v_val_id IS NOT NULL THEN
        -- Insert missing maps if they don't exist
        INSERT INTO maps (game_id, name, slug, image_url)
        VALUES 
            (v_val_id, 'Ascent', 'ascent', '/maps/valorant/Ascent.webp'),
            (v_val_id, 'Icebox', 'icebox', '/maps/valorant/Icebox.webp'),
            (v_val_id, 'Breeze', 'breeze', '/maps/valorant/Breeze.webp'),
            (v_val_id, 'Fracture', 'fracture', '/maps/valorant/Fracture.webp'),
            (v_val_id, 'Lotus', 'lotus', '/maps/valorant/Lotus.webp')
        ON CONFLICT (game_id, slug) DO UPDATE 
        SET image_url = EXCLUDED.image_url;
    END IF;
END $$;
