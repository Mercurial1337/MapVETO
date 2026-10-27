-- Only an explicit staff request can replace a deleted sheet veto. The event
-- lock is shared with the normal importer, serializing sync and double clicks.
CREATE OR REPLACE FUNCTION public.sheet_recreate_match(p_event uuid,p_user uuid,p_spreadsheet text,p_tab bigint,p_source uuid,p_request uuid,p_row jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path=public AS $$
DECLARE owner_id uuid; source sheet_match_sources%ROWTYPE; template veto_templates%ROWTYPE;
 pool jsonb; new_id uuid; scheduled timestamptz; stored jsonb; seed text;
BEGIN
 SELECT created_by INTO owner_id FROM events WHERE id=p_event FOR UPDATE;
 IF NOT FOUND OR (p_user IS DISTINCT FROM owner_id AND NOT EXISTS(SELECT 1 FROM event_admins WHERE event_id=p_event AND user_id=p_user AND role IN ('admin','vanguard'))) THEN RAISE EXCEPTION 'Head Ref access required'; END IF;
 IF p_request IS NULL OR NOT EXISTS(SELECT 1 FROM event_sheet_connections WHERE event_id=p_event AND spreadsheet_id=p_spreadsheet) THEN RAISE EXCEPTION 'Sheet connection changed; refresh preview'; END IF;
 SELECT * INTO source FROM sheet_match_sources WHERE id=p_source AND event_id=p_event AND spreadsheet_id=p_spreadsheet AND tab_id=p_tab FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Sheet source not found on this day'; END IF;
 IF source.recreation_request_id=p_request THEN
  IF source.match_id IS NULL THEN RAISE EXCEPTION 'This recreation was already processed and later deleted. Refresh preview.'; END IF;
  RETURN jsonb_build_object('created',0,'match_id',source.match_id,'already_recreated',true);
 END IF;
 IF NOT source.was_created OR source.match_id IS NOT NULL THEN RAISE EXCEPTION 'Only a deleted sheet match can be recreated'; END IF;
 IF jsonb_typeof(p_row) IS DISTINCT FROM 'object' OR p_row->>'source_id' IS DISTINCT FROM source.source_id OR p_row->>'status' IS DISTINCT FROM 'ready'
  OR COALESCE(p_row->>'format','') NOT IN ('bo1','bo3','bo5')
  OR length(trim(COALESCE(p_row->>'team_a',''))) NOT BETWEEN 1 AND 100 OR length(trim(COALESCE(p_row->>'team_b',''))) NOT BETWEEN 1 AND 100
  OR lower(trim(p_row->>'team_a'))=lower(trim(p_row->>'team_b')) OR p_row->>'schedule_error' IS NOT NULL THEN RAISE EXCEPTION 'Refresh preview and resolve this match before recreating it'; END IF;
 IF COALESCE(p_row->>'password_status','not_used') NOT IN ('not_used','supplied') OR (p_row->>'password_status'='supplied' AND (COALESCE(p_row->>'password_hash','') NOT LIKE 'scrypt$%' OR COALESCE(p_row->>'team_b_password_hash','') NOT LIKE 'scrypt$%')) THEN RAISE EXCEPTION 'Both team passwords must be prepared before recreation'; END IF;
 IF EXISTS(SELECT 1 FROM matches WHERE event_id=p_event AND sheet_source_id IS NULL AND status<>'cancelled' AND ((lower(team_a_name)=lower(p_row->>'team_a') AND lower(team_b_name)=lower(p_row->>'team_b')) OR (lower(team_a_name)=lower(p_row->>'team_b') AND lower(team_b_name)=lower(p_row->>'team_a')))) THEN RAISE EXCEPTION 'A manual match with these teams already exists'; END IF;
 SELECT * INTO template FROM veto_templates WHERE format=p_row->>'format' ORDER BY is_default DESC,created_at,id LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'No veto template for this format'; END IF;
 IF jsonb_typeof(p_row->'maps') IS DISTINCT FROM 'array' OR jsonb_array_length(p_row->'maps')<>7 THEN RAISE EXCEPTION 'Invalid competitive map pool'; END IF;
 SELECT jsonb_agg(id ORDER BY name) INTO pool FROM maps WHERE id IN (SELECT value::uuid FROM jsonb_array_elements_text(p_row->'maps')) AND game_id=template.game_id AND is_active;
 IF pool IS NULL OR jsonb_array_length(pool)<>7 THEN RAISE EXCEPTION 'The competitive pool must have seven active maps'; END IF;
 seed:=COALESCE(p_row->>'selection',source.selection);
 IF seed NOT IN ('A','B','C') THEN RAISE EXCEPTION 'Invalid higher seed / toss selection'; END IF;
 scheduled:=(p_row->>'scheduled_at')::timestamptz;
 new_id:=gen_random_uuid();
 INSERT INTO matches(id,event_id,created_by,veto_template_id,team_a_name,team_b_name,format,status,coin_toss_forced,coin_toss_winner,auto_coin_toss,map_pool_type,sheet_source_id,veto_scheduled_at,veto_schedule_enforced)
 VALUES(new_id,p_event,owner_id,template.id,p_row->>'team_a',p_row->>'team_b',template.format,'ready_check',seed<>'C',CASE seed WHEN 'A' THEN 'team_a' WHEN 'B' THEN 'team_b' ELSE NULL END,seed='C','competitive',source.id,scheduled,scheduled IS NOT NULL);
 UPDATE match_state SET available_maps=pool WHERE match_id=new_id;
 IF NOT FOUND OR (SELECT count(*) FROM match_links WHERE match_id=new_id AND link_type IN ('team_a','team_b','observer','admin','referee'))<>5 THEN RAISE EXCEPTION 'Match initialization failed'; END IF;
 IF p_row->>'password_status'='supplied' THEN
  INSERT INTO match_team_passwords(match_id,password_hash,team_b_password_hash,updated_by) VALUES(new_id,p_row->>'password_hash',p_row->>'team_b_password_hash',p_user);
 END IF;
 INSERT INTO event_teams(event_id,name) VALUES(p_event,p_row->>'team_a'),(p_event,p_row->>'team_b') ON CONFLICT(event_id,name) DO NOTHING;
 stored:=p_row-'password_hash'-'team_b_password_hash';
 UPDATE sheet_match_sources SET match_id=new_id,was_created=true,approved=true,status='created',issue='',snapshot=stored,created_snapshot=stored,
  selection=seed,schedule_overridden=COALESCE((p_row->>'schedule_overridden')::boolean,false),schedule_override=CASE WHEN (p_row->>'schedule_overridden')::boolean THEN scheduled ELSE NULL END,logos_checked_at=NULL,logos_retry_after=NULL,recreation_request_id=p_request,updated_at=now() WHERE id=source.id;
 UPDATE event_sheet_connections SET connected_by=p_user WHERE event_id=p_event;
 PERFORM veto_apply_schedule(new_id);
 RETURN jsonb_build_object('created',1,'match_id',new_id);
END $$;
REVOKE ALL ON FUNCTION public.sheet_recreate_match(uuid,uuid,text,bigint,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sheet_recreate_match(uuid,uuid,text,bigint,uuid,uuid,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';

