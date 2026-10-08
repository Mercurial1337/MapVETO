-- The application supplies its centrally configured competitive map IDs.
-- SQL still validates map activity, game, uniqueness and seven-map size.
DO $$ DECLARE definition text; old_block text; BEGIN
 SELECT pg_get_functiondef('sheet_apply_day(uuid,uuid,text,bigint,text,jsonb,jsonb)'::regprocedure) INTO definition;
 old_block:=E'  SELECT id INTO selected_pool_id FROM map_pools WHERE game_id=template.game_id AND is_default AND is_active LIMIT 1;\n  SELECT jsonb_agg(m.id ORDER BY pm.display_order,m.id) INTO pool FROM pool_maps pm JOIN maps m ON m.id=pm.map_id WHERE pm.pool_id=selected_pool_id AND m.is_active AND m.game_id=template.game_id;';
 definition:=replace(definition,old_block,E'  IF row ? ''maps'' THEN\n   IF jsonb_typeof(row->''maps'')<>''array'' OR jsonb_array_length(row->''maps'')<>7 THEN RAISE EXCEPTION ''Invalid competitive map pool''; END IF;\n   SELECT jsonb_agg(id ORDER BY name) INTO pool FROM maps WHERE id IN (SELECT value::uuid FROM jsonb_array_elements_text(row->''maps'')) AND game_id=template.game_id AND is_active;\n  ELSE\n'||old_block||E'\n  END IF;');
 EXECUTE definition;
END $$;
