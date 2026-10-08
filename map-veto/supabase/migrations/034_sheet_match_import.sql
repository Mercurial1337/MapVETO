CREATE TABLE event_sheet_connections (
 event_id uuid PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
 spreadsheet_id text NOT NULL CHECK(spreadsheet_id ~ '^[A-Za-z0-9_-]{20,100}$'),
 active_tabs jsonb NOT NULL DEFAULT '[]',
 connected_by uuid NOT NULL REFERENCES auth.users(id),
 last_sync_at timestamptz, last_error text, lease_until timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sheet_match_sources (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
 spreadsheet_id text NOT NULL, source_id text NOT NULL,
 tab_id bigint NOT NULL, tab_title text NOT NULL,
 approved boolean NOT NULL DEFAULT false,
 selection text NOT NULL DEFAULT 'C' CHECK(selection IN ('A','B','C')),
 snapshot jsonb NOT NULL, created_snapshot jsonb,
 match_id uuid REFERENCES matches(id) ON DELETE SET NULL,
 was_created boolean NOT NULL DEFAULT false,
 status text NOT NULL DEFAULT 'waiting', issue text NOT NULL DEFAULT '',
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(event_id,spreadsheet_id,source_id)
);
CREATE INDEX sheet_source_day ON sheet_match_sources(event_id,spreadsheet_id,tab_id);
ALTER TABLE matches ADD COLUMN sheet_source_id uuid UNIQUE REFERENCES sheet_match_sources(id) ON DELETE SET NULL;
CREATE TABLE sheet_worker_settings (
 id boolean PRIMARY KEY DEFAULT true CHECK(id),
 endpoint text,
 secret text NOT NULL DEFAULT (gen_random_uuid()::text||gen_random_uuid()::text)
);
INSERT INTO sheet_worker_settings(id) VALUES(true);
ALTER TABLE event_sheet_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE sheet_match_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE sheet_worker_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON event_sheet_connections,sheet_match_sources,sheet_worker_settings FROM PUBLIC,anon,authenticated;
GRANT ALL ON event_sheet_connections,sheet_match_sources,sheet_worker_settings TO service_role;

CREATE FUNCTION sheet_apply_day(p_event uuid,p_user uuid,p_spreadsheet text,p_tab bigint,p_title text,p_rows jsonb,p_choices jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SET search_path=public AS $$
DECLARE owner_id uuid; row jsonb; choice jsonb; source sheet_match_sources%ROWTYPE; config event_sheet_connections%ROWTYPE;
 template veto_templates%ROWTYPE; selected_pool_id uuid; pool jsonb; new_id uuid; created integer:=0; waiting integer:=0; conflicts integer:=0; approved_now boolean; selection_now text;
BEGIN
 SELECT created_by INTO owner_id FROM events WHERE id=p_event FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Event not found'; END IF;
 IF p_user IS DISTINCT FROM owner_id AND NOT EXISTS(SELECT 1 FROM event_admins WHERE event_id=p_event AND user_id=p_user AND role='admin') THEN RAISE EXCEPTION 'Head Admin access required'; END IF;
 SELECT * INTO config FROM event_sheet_connections WHERE event_id=p_event;
 IF NOT FOUND OR config.spreadsheet_id<>p_spreadsheet THEN RAISE EXCEPTION 'Sheet connection changed; refresh preview'; END IF;
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
  SELECT * INTO source FROM sheet_match_sources WHERE event_id=p_event AND spreadsheet_id=p_spreadsheet AND source_id=row->>'source_id';
  choice:=NULL;
  IF p_choices IS NOT NULL THEN SELECT value INTO choice FROM jsonb_array_elements(p_choices) WHERE value->>'source_id'=row->>'source_id'; END IF;
  approved_now:=CASE WHEN p_choices IS NULL THEN COALESCE(source.approved,false) ELSE choice IS NOT NULL END;
  selection_now:=COALESCE(choice->>'selection',source.selection,'C');
  INSERT INTO sheet_match_sources(event_id,spreadsheet_id,source_id,tab_id,tab_title,approved,selection,snapshot,status,issue)
   VALUES(p_event,p_spreadsheet,row->>'source_id',p_tab,p_title,approved_now,selection_now,row,row->>'status',COALESCE(row->>'issue',''))
   ON CONFLICT(event_id,spreadsheet_id,source_id) DO UPDATE SET snapshot=EXCLUDED.snapshot,approved=CASE WHEN sheet_match_sources.was_created THEN sheet_match_sources.approved ELSE EXCLUDED.approved END,selection=CASE WHEN sheet_match_sources.was_created THEN sheet_match_sources.selection ELSE EXCLUDED.selection END,updated_at=now()
   RETURNING * INTO source;
  IF source.was_created THEN
   IF source.match_id IS NULL THEN UPDATE sheet_match_sources SET status='deleted',issue='Previously created veto was deleted; automatic recreation is blocked.' WHERE id=source.id;
   ELSIF source.created_snapshot->>'team_a' IS DISTINCT FROM row->>'team_a' OR source.created_snapshot->>'team_b' IS DISTINCT FROM row->>'team_b' OR source.created_snapshot->>'format' IS DISTINCT FROM row->>'format' THEN
    UPDATE sheet_match_sources SET status='conflict',issue='Teams or format changed after creation. Existing veto is unchanged.' WHERE id=source.id;conflicts:=conflicts+1;
   ELSE UPDATE sheet_match_sources SET status='created',issue='' WHERE id=source.id; END IF;
   CONTINUE;
  END IF;
  UPDATE sheet_match_sources SET status=CASE WHEN NOT source.approved THEN 'excluded' ELSE row->>'status' END,issue=COALESCE(row->>'issue','') WHERE id=source.id;
  IF NOT source.approved THEN CONTINUE; END IF;
  IF row->>'status'<>'ready' THEN waiting:=waiting+1;CONTINUE; END IF;
  IF row->>'format' NOT IN ('bo1','bo3','bo5') OR length(trim(row->>'team_a')) NOT BETWEEN 1 AND 100 OR length(trim(row->>'team_b')) NOT BETWEEN 1 AND 100 OR lower(trim(row->>'team_a'))=lower(trim(row->>'team_b')) THEN RAISE EXCEPTION 'Invalid resolved match'; END IF;
  -- A manual pairing needs an explicit decision rather than a second veto.
  IF EXISTS(SELECT 1 FROM matches WHERE event_id=p_event AND sheet_source_id IS NULL AND status<>'cancelled' AND ((lower(team_a_name)=lower(row->>'team_a') AND lower(team_b_name)=lower(row->>'team_b')) OR (lower(team_a_name)=lower(row->>'team_b') AND lower(team_b_name)=lower(row->>'team_a')))) THEN
   UPDATE sheet_match_sources SET status='conflict',issue='A manual match with these teams already exists. Review it before importing.' WHERE id=source.id;conflicts:=conflicts+1;CONTINUE;
  END IF;
  SELECT * INTO template FROM veto_templates WHERE format=row->>'format' ORDER BY is_default DESC,created_at,id LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'No veto template for %',row->>'format'; END IF;
  SELECT id INTO selected_pool_id FROM map_pools WHERE game_id=template.game_id AND is_default AND is_active LIMIT 1;
  SELECT jsonb_agg(m.id ORDER BY pm.display_order,m.id) INTO pool FROM pool_maps pm JOIN maps m ON m.id=pm.map_id WHERE pm.pool_id=selected_pool_id AND m.is_active AND m.game_id=template.game_id;
  IF pool IS NULL OR jsonb_array_length(pool)<>7 THEN RAISE EXCEPTION 'The system competitive pool must have seven active maps'; END IF;
  new_id:=gen_random_uuid();
  INSERT INTO matches(id,event_id,created_by,veto_template_id,team_a_name,team_b_name,format,status,coin_toss_forced,coin_toss_winner,auto_coin_toss,map_pool_type,sheet_source_id)
   VALUES(new_id,p_event,owner_id,template.id,row->>'team_a',row->>'team_b',template.format,'ready_check',source.selection<>'C',CASE source.selection WHEN 'A' THEN 'team_a' WHEN 'B' THEN 'team_b' ELSE NULL END,source.selection='C','competitive',source.id);
  UPDATE match_state SET available_maps=pool WHERE match_id=new_id;
  IF NOT FOUND OR (SELECT count(*) FROM match_links WHERE match_id=new_id AND link_type IN ('team_a','team_b','observer','admin'))<>4 THEN RAISE EXCEPTION 'Match initialization failed'; END IF;
  INSERT INTO event_teams(event_id,name) VALUES(p_event,row->>'team_a'),(p_event,row->>'team_b') ON CONFLICT(event_id,name) DO NOTHING;
  UPDATE sheet_match_sources SET match_id=new_id,was_created=true,created_snapshot=row,status='created',issue='' WHERE id=source.id;created:=created+1;
 END LOOP;
 UPDATE sheet_match_sources SET status='missing',issue='Approved match ID is missing from the sheet. No veto was deleted.' WHERE event_id=p_event AND spreadsheet_id=p_spreadsheet AND tab_id=p_tab AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_rows) r WHERE r->>'source_id'=sheet_match_sources.source_id);
 IF p_choices IS NOT NULL THEN
  UPDATE event_sheet_connections SET active_tabs=(SELECT COALESCE(jsonb_agg(t),'[]') FROM jsonb_array_elements(active_tabs) t WHERE (t->>'id')::bigint<>p_tab)||jsonb_build_array(jsonb_build_object('id',p_tab,'title',p_title)),updated_at=now() WHERE event_id=p_event;
 END IF;
 RETURN jsonb_build_object('created',created,'waiting',waiting,'conflicts',conflicts);
END $$;
REVOKE ALL ON FUNCTION sheet_apply_day(uuid,uuid,text,bigint,text,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION sheet_apply_day(uuid,uuid,text,bigint,text,jsonb,jsonb) TO service_role;

CREATE FUNCTION sheet_claim_sync() RETURNS SETOF event_sheet_connections LANGUAGE sql SET search_path=public AS $$
 UPDATE event_sheet_connections SET lease_until=now()+interval '90 seconds'
 WHERE event_id IN (SELECT event_id FROM event_sheet_connections WHERE jsonb_array_length(active_tabs)>0 AND (lease_until IS NULL OR lease_until<now()) AND (last_sync_at IS NULL OR last_sync_at<now()-interval '60 seconds') ORDER BY last_sync_at NULLS FIRST LIMIT 2 FOR UPDATE SKIP LOCKED)
 RETURNING *;
$$;
REVOKE ALL ON FUNCTION sheet_claim_sync() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION sheet_claim_sync() TO service_role;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE FUNCTION sheet_dispatch_sync() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE settings sheet_worker_settings%ROWTYPE;
BEGIN
 SELECT * INTO settings FROM sheet_worker_settings WHERE id;
 IF settings.endpoint IS NOT NULL AND EXISTS(SELECT 1 FROM event_sheet_connections WHERE jsonb_array_length(active_tabs)>0) THEN
  PERFORM net.http_post(url:=settings.endpoint,headers:=jsonb_build_object('Authorization','Bearer '||settings.secret,'Content-Type','application/json'),body:='{}'::jsonb,timeout_milliseconds:=55000);
 END IF;
END $$;
REVOKE ALL ON FUNCTION sheet_dispatch_sync() FROM PUBLIC,anon,authenticated;
SELECT cron.schedule('map-veto-sheet-sync','* * * * *','SELECT public.sheet_dispatch_sync()');
