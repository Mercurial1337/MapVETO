DO $$ DECLARE definition text; BEGIN
 SELECT pg_get_functiondef('sheet_apply_day(uuid,uuid,text,bigint,text,jsonb,jsonb)'::regprocedure) INTO definition;
 definition:=replace(definition,' pool_id uuid;',' selected_pool_id uuid;');
 definition:=replace(definition,'INTO pool_id FROM map_pools','INTO selected_pool_id FROM map_pools');
 definition:=replace(definition,'pm.pool_id=pool_id','pm.pool_id=selected_pool_id');
 definition:=replace(definition,'IF jsonb_typeof(p_rows)',E'IF p_choices IS NULL AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(config.active_tabs) t WHERE (t->>''id'')::bigint=p_tab) THEN RETURN jsonb_build_object(''created'',0,''waiting'',0,''conflicts'',0); END IF;\n IF jsonb_typeof(p_rows)');
 EXECUTE definition;
END $$;
CREATE FUNCTION sheet_link_existing(p_event uuid,p_user uuid,p_source uuid,p_match uuid) RETURNS void LANGUAGE plpgsql SET search_path=public AS $$
DECLARE owner_id uuid; source sheet_match_sources%ROWTYPE; existing matches%ROWTYPE;
BEGIN
 SELECT created_by INTO owner_id FROM events WHERE id=p_event FOR UPDATE;
 IF NOT FOUND OR (p_user IS DISTINCT FROM owner_id AND NOT EXISTS(SELECT 1 FROM event_admins WHERE event_id=p_event AND user_id=p_user AND role='admin')) THEN RAISE EXCEPTION 'Head Admin access required'; END IF;
 SELECT s.* INTO source FROM sheet_match_sources s JOIN event_sheet_connections c ON c.event_id=s.event_id AND c.spreadsheet_id=s.spreadsheet_id WHERE s.id=p_source AND s.event_id=p_event FOR UPDATE OF s;
 IF NOT FOUND OR source.was_created OR NOT source.approved OR source.snapshot->>'status'<>'ready' THEN RAISE EXCEPTION 'Only an approved unresolved import can be linked'; END IF;
 SELECT * INTO existing FROM matches WHERE id=p_match AND event_id=p_event FOR UPDATE;
 IF NOT FOUND OR existing.sheet_source_id IS NOT NULL OR existing.status='cancelled' OR existing.format<>source.snapshot->>'format' OR lower(existing.team_a_name)<>lower(source.snapshot->>'team_a') OR lower(existing.team_b_name)<>lower(source.snapshot->>'team_b') THEN RAISE EXCEPTION 'Choose an unlinked match with matching format and team order'; END IF;
 UPDATE matches SET sheet_source_id=source.id WHERE id=p_match;
 UPDATE sheet_match_sources SET match_id=p_match,was_created=true,created_snapshot=snapshot,status='created',issue='',updated_at=now() WHERE id=p_source;
END $$;
REVOKE ALL ON FUNCTION sheet_link_existing(uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION sheet_link_existing(uuid,uuid,uuid,uuid) TO service_role;
