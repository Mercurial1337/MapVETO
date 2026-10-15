-- Existing shared passwords remain valid until the organizer approves a pair.
-- password_hash belongs to the original team_a link; team_b_password_hash to team_b.
-- Link identity stays unchanged when the winner swaps veto positions.
ALTER TABLE public.match_team_passwords ADD COLUMN team_b_password_hash text
 CHECK(team_b_password_hash IS NULL OR team_b_password_hash LIKE 'scrypt$%');

CREATE OR REPLACE FUNCTION sheet_apply_day(p_event uuid,p_user uuid,p_spreadsheet text,p_tab bigint,p_title text,p_rows jsonb,p_choices jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SET search_path=public AS $$
DECLARE owner_id uuid; row jsonb; stored jsonb; choice jsonb; source sheet_match_sources%ROWTYPE; config event_sheet_connections%ROWTYPE;
 template veto_templates%ROWTYPE; selected_pool_id uuid; pool jsonb; new_id uuid; created integer:=0; waiting integer:=0; conflicts integer:=0; approved_now boolean; selection_now text;
 outcome text; results jsonb:='[]';
BEGIN
 SELECT created_by INTO owner_id FROM events WHERE id=p_event FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Event not found'; END IF;
 IF p_user IS DISTINCT FROM owner_id AND NOT EXISTS(SELECT 1 FROM event_admins WHERE event_id=p_event AND user_id=p_user AND role='admin') THEN RAISE EXCEPTION 'Head Admin access required'; END IF;
 SELECT * INTO config FROM event_sheet_connections WHERE event_id=p_event;
 IF NOT FOUND OR config.spreadsheet_id<>p_spreadsheet THEN RAISE EXCEPTION 'Sheet connection changed; refresh preview'; END IF;
 IF p_choices IS NULL AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(config.active_tabs) t WHERE (t->>'id')::bigint=p_tab) THEN RETURN jsonb_build_object('created',0,'waiting',0,'conflicts',0); END IF;
 IF jsonb_typeof(p_rows)<>'array' OR jsonb_array_length(p_rows)>500 THEN RAISE EXCEPTION 'Invalid day rows'; END IF;
 -- Duplicate IDs block the whole day, including IDs already registered on another tab.
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_rows) r WHERE r->>'source_id'<>'' GROUP BY r->>'source_id' HAVING count(*)>1) THEN RAISE EXCEPTION 'Duplicate Match ID'; END IF;
 IF EXISTS(SELECT 1 FROM sheet_match_sources s JOIN jsonb_array_elements(p_rows) r ON s.source_id=r->>'source_id' WHERE s.event_id=p_event AND s.spreadsheet_id=p_spreadsheet AND s.tab_id<>p_tab) THEN RAISE EXCEPTION 'Match ID is already used on another day tab'; END IF;
 IF p_choices IS NOT NULL THEN
  IF jsonb_typeof(p_choices)<>'array' THEN RAISE EXCEPTION 'Invalid selections'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_choices) c WHERE c->>'selection' NOT IN ('A','B','C') OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_rows) r WHERE r->>'source_id'=c->>'source_id' AND r->>'status' IN ('ready','waiting'))) THEN RAISE EXCEPTION 'Invalid selected match'; END IF;
 END IF;
 FOR row IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
  IF COALESCE(row->>'source_id','')='' OR row->>'source_id' !~ '^[A-Za-z0-9_.-]{1,100}$' THEN CONTINUE; END IF;
  stored:=row-'password_hash'-'team_b_password_hash';
  SELECT * INTO source FROM sheet_match_sources WHERE event_id=p_event AND spreadsheet_id=p_spreadsheet AND source_id=row->>'source_id';
  choice:=NULL;outcome:=NULL;
  IF p_choices IS NOT NULL THEN SELECT value INTO choice FROM jsonb_array_elements(p_choices) WHERE value->>'source_id'=row->>'source_id'; END IF;
  approved_now:=CASE WHEN p_choices IS NULL THEN COALESCE(source.approved,false) ELSE choice IS NOT NULL END;
  selection_now:=COALESCE(choice->>'selection',source.selection,'C');
  INSERT INTO sheet_match_sources(event_id,spreadsheet_id,source_id,tab_id,tab_title,approved,selection,snapshot,status,issue)
   VALUES(p_event,p_spreadsheet,row->>'source_id',p_tab,p_title,approved_now,selection_now,stored,row->>'status',COALESCE(row->>'issue',''))
   ON CONFLICT(event_id,spreadsheet_id,source_id) DO UPDATE SET snapshot=EXCLUDED.snapshot,approved=CASE WHEN sheet_match_sources.was_created THEN sheet_match_sources.approved ELSE EXCLUDED.approved END,selection=CASE WHEN sheet_match_sources.was_created THEN sheet_match_sources.selection ELSE EXCLUDED.selection END,updated_at=now()
   RETURNING * INTO source;
  IF source.was_created THEN
   IF source.match_id IS NULL THEN UPDATE sheet_match_sources SET status='deleted',issue='Previously created veto was deleted; automatic recreation is blocked.' WHERE id=source.id;outcome:='deleted';
   ELSIF source.created_snapshot->>'team_a' IS DISTINCT FROM row->>'team_a' OR source.created_snapshot->>'team_b' IS DISTINCT FROM row->>'team_b' OR source.created_snapshot->>'format' IS DISTINCT FROM row->>'format' THEN
    UPDATE sheet_match_sources SET status='conflict',issue='Teams or format changed after creation. Existing veto is unchanged.' WHERE id=source.id;conflicts:=conflicts+1;outcome:='conflict';
   -- A sheet password change never silently replaces the active one.
   ELSIF COALESCE(source.created_snapshot->>'password_fingerprint','')<>COALESCE(row->>'password_fingerprint','') THEN
    UPDATE sheet_match_sources SET status='conflict',issue=CASE
     WHEN COALESCE(row->>'password_fingerprint','')='' THEN 'Password removed or invalid in the sheet. The current match password still applies.'
     WHEN NOT EXISTS(SELECT 1 FROM match_team_passwords WHERE match_id=source.match_id) THEN 'The sheet now has a password for this match. A Head Admin must approve it before team links require it.'
     ELSE 'Password changed in the sheet. A Head Admin must approve the replacement; the current password stays active until then.' END WHERE id=source.id;
    conflicts:=conflicts+1;outcome:='conflict';
   ELSE UPDATE sheet_match_sources SET status='created',issue='' WHERE id=source.id;outcome:='already_imported'; END IF;
   IF choice IS NOT NULL THEN results:=results||jsonb_build_object('source_id',row->>'source_id','outcome',outcome); END IF;
   CONTINUE;
  END IF;
  UPDATE sheet_match_sources SET status=CASE WHEN NOT source.approved THEN 'excluded' ELSE row->>'status' END,issue=COALESCE(row->>'issue','') WHERE id=source.id;
  IF NOT source.approved THEN CONTINUE; END IF;
  IF row->>'status'<>'ready' THEN
   waiting:=waiting+1;
   IF choice IS NOT NULL THEN results:=results||jsonb_build_object('source_id',row->>'source_id','outcome','waiting'); END IF;
   CONTINUE;
  END IF;
  IF row->>'format' NOT IN ('bo1','bo3','bo5') OR length(trim(row->>'team_a')) NOT BETWEEN 1 AND 100 OR length(trim(row->>'team_b')) NOT BETWEEN 1 AND 100 OR lower(trim(row->>'team_a'))=lower(trim(row->>'team_b')) THEN RAISE EXCEPTION 'Invalid resolved match'; END IF;
  -- Fail closed: a row with a sheet password must never create an unprotected match.
  IF COALESCE(row->>'password_status','not_used') NOT IN ('not_used','supplied') OR (row->>'password_status'='supplied' AND (COALESCE(row->>'password_hash','') NOT LIKE 'scrypt$%' OR (row ? 'team_b_password_hash' AND COALESCE(row->>'team_b_password_hash','') NOT LIKE 'scrypt$%'))) THEN RAISE EXCEPTION 'Match password was not prepared for %',row->>'source_id'; END IF;
  -- A manual pairing needs an explicit decision rather than a second veto.
  IF EXISTS(SELECT 1 FROM matches WHERE event_id=p_event AND sheet_source_id IS NULL AND status<>'cancelled' AND ((lower(team_a_name)=lower(row->>'team_a') AND lower(team_b_name)=lower(row->>'team_b')) OR (lower(team_a_name)=lower(row->>'team_b') AND lower(team_b_name)=lower(row->>'team_a')))) THEN
   UPDATE sheet_match_sources SET status='conflict',issue='A manual match with these teams already exists. Review it before importing.' WHERE id=source.id;conflicts:=conflicts+1;
   IF choice IS NOT NULL THEN results:=results||jsonb_build_object('source_id',row->>'source_id','outcome','conflict'); END IF;
   CONTINUE;
  END IF;
  SELECT * INTO template FROM veto_templates WHERE format=row->>'format' ORDER BY is_default DESC,created_at,id LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'No veto template for %',row->>'format'; END IF;
  IF row ? 'maps' THEN
   IF jsonb_typeof(row->'maps')<>'array' OR jsonb_array_length(row->'maps')<>7 THEN RAISE EXCEPTION 'Invalid competitive map pool'; END IF;
   SELECT jsonb_agg(id ORDER BY name) INTO pool FROM maps WHERE id IN (SELECT value::uuid FROM jsonb_array_elements_text(row->'maps')) AND game_id=template.game_id AND is_active;
  ELSE
   SELECT id INTO selected_pool_id FROM map_pools WHERE game_id=template.game_id AND is_default AND is_active LIMIT 1;
   SELECT jsonb_agg(m.id ORDER BY pm.display_order,m.id) INTO pool FROM pool_maps pm JOIN maps m ON m.id=pm.map_id WHERE pm.pool_id=selected_pool_id AND m.is_active AND m.game_id=template.game_id;
  END IF;
  IF pool IS NULL OR jsonb_array_length(pool)<>7 THEN RAISE EXCEPTION 'The system competitive pool must have seven active maps'; END IF;
  new_id:=gen_random_uuid();
  INSERT INTO matches(id,event_id,created_by,veto_template_id,team_a_name,team_b_name,format,status,coin_toss_forced,coin_toss_winner,auto_coin_toss,map_pool_type,sheet_source_id)
   VALUES(new_id,p_event,owner_id,template.id,row->>'team_a',row->>'team_b',template.format,'ready_check',source.selection<>'C',CASE source.selection WHEN 'A' THEN 'team_a' WHEN 'B' THEN 'team_b' ELSE NULL END,source.selection='C','competitive',source.id);
  UPDATE match_state SET available_maps=pool WHERE match_id=new_id;
  IF NOT FOUND OR (SELECT count(*) FROM match_links WHERE match_id=new_id AND link_type IN ('team_a','team_b','observer','admin'))<>4 THEN RAISE EXCEPTION 'Match initialization failed'; END IF;
  IF row->>'password_status'='supplied' THEN INSERT INTO match_team_passwords(match_id,password_hash,team_b_password_hash,updated_by) VALUES(new_id,row->>'password_hash',row->>'team_b_password_hash',p_user); END IF;
  INSERT INTO event_teams(event_id,name) VALUES(p_event,row->>'team_a'),(p_event,row->>'team_b') ON CONFLICT(event_id,name) DO NOTHING;
  UPDATE sheet_match_sources SET match_id=new_id,was_created=true,created_snapshot=stored,status='created',issue='' WHERE id=source.id;created:=created+1;
  IF choice IS NOT NULL THEN results:=results||jsonb_build_object('source_id',row->>'source_id','outcome','created'); END IF;
 END LOOP;
 UPDATE sheet_match_sources SET status='missing',issue='Approved match ID is missing from the sheet. No veto was deleted.' WHERE event_id=p_event AND spreadsheet_id=p_spreadsheet AND tab_id=p_tab AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_rows) r WHERE r->>'source_id'=sheet_match_sources.source_id);
 IF p_choices IS NOT NULL THEN
  UPDATE event_sheet_connections SET active_tabs=(SELECT COALESCE(jsonb_agg(t),'[]') FROM jsonb_array_elements(active_tabs) t WHERE (t->>'id')::bigint<>p_tab)||jsonb_build_array(jsonb_build_object('id',p_tab,'title',p_title)),updated_at=now() WHERE event_id=p_event;
 END IF;
 RETURN jsonb_build_object('created',created,'waiting',waiting,'conflicts',conflicts,'results',results);
END $$;

CREATE FUNCTION sheet_replace_team_passwords(p_event uuid,p_user uuid,p_source uuid,p_fingerprint text,p_hash text,p_team_b_hash text) RETURNS integer LANGUAGE plpgsql SET search_path=public AS $$
DECLARE owner_id uuid; source sheet_match_sources%ROWTYPE; next_version integer;
BEGIN
 SELECT created_by INTO owner_id FROM events WHERE id=p_event FOR UPDATE;
 IF NOT FOUND OR (p_user IS DISTINCT FROM owner_id AND NOT EXISTS(SELECT 1 FROM event_admins WHERE event_id=p_event AND user_id=p_user AND role='admin')) THEN RAISE EXCEPTION 'Head Admin access required'; END IF;
 IF COALESCE(p_team_b_hash,'') NOT LIKE 'scrypt$%' OR COALESCE(p_hash,'') NOT LIKE 'scrypt$%' OR COALESCE(p_fingerprint,'') !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Invalid password update'; END IF;
 SELECT s.* INTO source FROM sheet_match_sources s JOIN event_sheet_connections c ON c.event_id=s.event_id AND c.spreadsheet_id=s.spreadsheet_id WHERE s.id=p_source AND s.event_id=p_event FOR UPDATE OF s;
 IF NOT FOUND OR NOT source.was_created OR source.match_id IS NULL THEN RAISE EXCEPTION 'Only an imported match can receive a sheet password'; END IF;
 INSERT INTO match_team_passwords(match_id,password_hash,team_b_password_hash,updated_by) VALUES(source.match_id,p_hash,p_team_b_hash,p_user)
  ON CONFLICT(match_id) DO UPDATE SET password_hash=EXCLUDED.password_hash,team_b_password_hash=EXCLUDED.team_b_password_hash,version=match_team_passwords.version+1,updated_at=now(),updated_by=p_user
  RETURNING version INTO next_version;
 DELETE FROM match_password_attempts WHERE match_id=source.match_id;
 UPDATE sheet_match_sources SET created_snapshot=COALESCE(created_snapshot,'{}')||jsonb_build_object('password_fingerprint',p_fingerprint),
  status=CASE WHEN created_snapshot->>'team_a' IS NOT DISTINCT FROM snapshot->>'team_a' AND created_snapshot->>'team_b' IS NOT DISTINCT FROM snapshot->>'team_b' AND created_snapshot->>'format' IS NOT DISTINCT FROM snapshot->>'format' THEN 'created' ELSE status END,
  issue=CASE WHEN created_snapshot->>'team_a' IS NOT DISTINCT FROM snapshot->>'team_a' AND created_snapshot->>'team_b' IS NOT DISTINCT FROM snapshot->>'team_b' AND created_snapshot->>'format' IS NOT DISTINCT FROM snapshot->>'format' THEN '' ELSE issue END,
  updated_at=now() WHERE id=source.id;
 RETURN next_version;
END $$;

REVOKE ALL ON FUNCTION sheet_replace_team_passwords(uuid,uuid,uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION sheet_replace_team_passwords(uuid,uuid,uuid,text,text,text) TO service_role;
