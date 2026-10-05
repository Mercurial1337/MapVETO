CREATE TABLE match_import_batches (
 id uuid PRIMARY KEY,
 event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
 created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 file_name text NOT NULL CHECK(length(file_name) BETWEEN 1 AND 200),
 match_count integer NOT NULL CHECK(match_count BETWEEN 1 AND 500),
 format text NOT NULL CHECK(format IN ('bo1','bo3','bo5')),
 created_at timestamptz NOT NULL DEFAULT now(),
 payload jsonb NOT NULL
);
ALTER TABLE matches ADD COLUMN bulk_batch_id uuid REFERENCES match_import_batches(id) ON DELETE SET NULL;
ALTER TABLE matches ADD COLUMN auto_coin_toss boolean NOT NULL DEFAULT false;
ALTER TABLE matches ADD COLUMN match_number integer CHECK(match_number>0);
CREATE UNIQUE INDEX matches_import_number ON matches(bulk_batch_id,match_number) WHERE bulk_batch_id IS NOT NULL;
CREATE INDEX matches_event_import ON matches(event_id,bulk_batch_id,created_at DESC);
CREATE INDEX imports_event_date ON match_import_batches(event_id,created_at DESC);
ALTER TABLE match_import_batches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON match_import_batches FROM PUBLIC,anon,authenticated;
GRANT SELECT ON match_import_batches TO authenticated;
GRANT ALL ON match_import_batches TO service_role;
CREATE POLICY imports_event_admin_read ON match_import_batches FOR SELECT TO authenticated USING (
 EXISTS(SELECT 1 FROM events WHERE id=event_id AND created_by=auth.uid()) OR
 EXISTS(SELECT 1 FROM event_admins WHERE event_admins.event_id=match_import_batches.event_id AND user_id=auth.uid())
);

CREATE OR REPLACE FUNCTION bulk_create_matches(p_event_id uuid,p_user_id uuid,p_batch_id uuid,p_file_name text,p_template_id uuid,p_rows jsonb,p_maps uuid[])
RETURNS jsonb LANGUAGE plpgsql SET search_path=public AS $$
DECLARE batch match_import_batches%ROWTYPE; template veto_templates%ROWTYPE; row jsonb; new_match_id uuid; payload jsonb; ids jsonb:='[]'; owner_id uuid; pool jsonb;
BEGIN
 SELECT created_by INTO owner_id FROM events WHERE id=p_event_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Event not found'; END IF;
 IF p_user_id IS NULL OR (owner_id IS DISTINCT FROM p_user_id AND NOT EXISTS(SELECT 1 FROM event_admins WHERE event_id=p_event_id AND user_id=p_user_id)) THEN RAISE EXCEPTION 'Event administrator required'; END IF;
 IF p_batch_id IS NULL OR p_file_name IS NULL OR length(trim(p_file_name)) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Invalid import file'; END IF;
 IF p_rows IS NULL OR jsonb_typeof(p_rows)<>'array' THEN RAISE EXCEPTION 'Invalid match rows'; END IF;
 IF jsonb_array_length(p_rows) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Import 1 to 500 matches'; END IF;
 payload:=jsonb_build_object('file_name',trim(p_file_name),'template_id',p_template_id,'rows',p_rows,'maps',to_jsonb(p_maps));
 SELECT * INTO batch FROM match_import_batches WHERE id=p_batch_id;
 IF FOUND THEN
  IF batch.event_id<>p_event_id OR batch.created_by IS DISTINCT FROM p_user_id OR batch.payload<>payload THEN RAISE EXCEPTION 'Import ID already used with different data'; END IF;
  SELECT COALESCE(jsonb_agg(id ORDER BY match_number),'[]') INTO ids FROM matches WHERE bulk_batch_id=p_batch_id;
  RETURN jsonb_build_object('batch_id',batch.id,'file_name',batch.file_name,'match_count',batch.match_count,'match_ids',ids,'reused',true);
 END IF;
 SELECT * INTO template FROM veto_templates WHERE id=p_template_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Veto template not found'; END IF;
 IF COALESCE(cardinality(p_maps),0)<2 OR cardinality(p_maps)<>(SELECT count(DISTINCT id) FROM maps WHERE id=ANY(p_maps) AND game_id=template.game_id AND is_active) THEN RAISE EXCEPTION 'Invalid map pool'; END IF;
 pool:=to_jsonb(p_maps);
 INSERT INTO match_import_batches(id,event_id,created_by,file_name,match_count,format,payload) VALUES(p_batch_id,p_event_id,p_user_id,trim(p_file_name),jsonb_array_length(p_rows),template.format,payload);
 FOR row IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
  IF jsonb_typeof(row->'match_number') IS DISTINCT FROM 'number' OR (row->>'match_number')::integer<1 OR
   row->>'selection' IS NULL OR row->>'selection' NOT IN ('A','B','C') OR
   row->>'team_a_name' IS NULL OR row->>'team_b_name' IS NULL OR
   length(trim(row->>'team_a_name')) NOT BETWEEN 1 AND 100 OR length(trim(row->>'team_b_name')) NOT BETWEEN 1 AND 100 OR
   lower(trim(row->>'team_a_name'))=lower(trim(row->>'team_b_name')) THEN RAISE EXCEPTION 'Invalid match row'; END IF;
  new_match_id:=gen_random_uuid();
  INSERT INTO matches(id,event_id,created_by,veto_template_id,team_a_name,team_b_name,format,status,coin_toss_forced,coin_toss_winner,bulk_batch_id,match_number,auto_coin_toss)
  VALUES(new_match_id,p_event_id,p_user_id,p_template_id,trim(row->>'team_a_name'),trim(row->>'team_b_name'),template.format,'ready_check',row->>'selection'<>'C',CASE row->>'selection' WHEN 'A' THEN 'team_a' WHEN 'B' THEN 'team_b' ELSE NULL END,p_batch_id,(row->>'match_number')::integer,row->>'selection'='C');
  -- Existing creation triggers produce state and all four magic links.
  UPDATE match_state SET available_maps=pool WHERE match_state.match_id=new_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Match initialization failed'; END IF;
  IF (SELECT count(*) FROM match_links WHERE match_links.match_id=new_match_id AND link_type IN ('team_a','team_b','observer','admin'))<>4 THEN RAISE EXCEPTION 'Match link initialization failed'; END IF;
  INSERT INTO event_teams(event_id,name) VALUES(p_event_id,trim(row->>'team_a_name')),(p_event_id,trim(row->>'team_b_name')) ON CONFLICT(event_id,name) DO NOTHING;
  ids:=ids || jsonb_build_array(new_match_id);
 END LOOP;
 RETURN jsonb_build_object('batch_id',p_batch_id,'file_name',trim(p_file_name),'match_count',jsonb_array_length(p_rows),'match_ids',ids,'reused',false);
END $$;
REVOKE ALL ON FUNCTION bulk_create_matches(uuid,uuid,uuid,text,uuid,jsonb,uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION bulk_create_matches(uuid,uuid,uuid,text,uuid,jsonb,uuid[]) TO service_role;

-- C imports toss atomically when the second team checks in.
CREATE OR REPLACE FUNCTION veto_ready(p_match_id uuid, p_token uuid)
RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $$
DECLARE s match_state%ROWTYPE; m matches%ROWTYPE; team text;
BEGIN
  SELECT * INTO s FROM match_state WHERE match_id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Match state not found'; END IF;
  SELECT * INTO m FROM matches WHERE id = p_match_id;
  SELECT link_type INTO team FROM match_links WHERE match_id = p_match_id AND token = p_token
    AND (expires_at IS NULL OR expires_at > now());
  IF team IS NULL OR team NOT IN ('team_a', 'team_b') THEN RAISE EXCEPTION 'Valid team link required'; END IF;
  IF (team = 'team_a' AND s.team_a_ready) OR (team = 'team_b' AND s.team_b_ready) THEN
    RETURN jsonb_build_object('new_state', to_jsonb(s), 'match', to_jsonb(m));
  END IF;
  IF m.status <> 'ready_check' THEN RAISE EXCEPTION 'Check-in is not available'; END IF;
  UPDATE match_state SET
    team_a_ready = team_a_ready OR team = 'team_a',
    team_b_ready = team_b_ready OR team = 'team_b',
    team_a_ready_at = CASE WHEN team = 'team_a' THEN now() ELSE team_a_ready_at END,
    team_b_ready_at = CASE WHEN team = 'team_b' THEN now() ELSE team_b_ready_at END
    WHERE match_id = p_match_id RETURNING * INTO s;
  INSERT INTO match_logs(match_id, step_number, action_type, actor, metadata)
    VALUES(p_match_id, -2, 'ready_check', team, jsonb_build_object('confirmed_at', now()));
  IF s.team_a_ready AND s.team_b_ready THEN
    UPDATE matches SET status = CASE WHEN coin_toss_forced AND coin_toss_winner IS NOT NULL
      THEN 'side_selection' ELSE 'coin_toss' END WHERE id = p_match_id RETURNING * INTO m;
    UPDATE match_state SET automation_enabled=true, turn_started_at=now(), current_turn=m.coin_toss_winner WHERE match_id=p_match_id RETURNING * INTO s;
    IF m.status='coin_toss' AND m.auto_coin_toss THEN
      UPDATE matches SET coin_toss_winner=CASE WHEN random()<0.5 THEN 'team_a' ELSE 'team_b' END,status='side_selection' WHERE id=p_match_id RETURNING * INTO m;
      UPDATE match_state SET current_turn=m.coin_toss_winner,turn_started_at=now() WHERE match_id=p_match_id RETURNING * INTO s;
      INSERT INTO match_logs(match_id,step_number,action_type,actor,metadata)
        VALUES(p_match_id,-1,'coin_toss',m.coin_toss_winner,jsonb_build_object('selection_method','coin_toss','automatic_coin_toss',true,'confirmed_at',now()));
    END IF;
    IF m.status = 'side_selection' AND m.coin_toss_forced THEN
      INSERT INTO match_logs(match_id, step_number, action_type, actor, metadata)
        VALUES(p_match_id, -1, 'coin_toss', m.coin_toss_winner,
          jsonb_build_object('is_seeded', true, 'selection_method', 'higher_seed'));
    END IF;
  END IF;
  RETURN jsonb_build_object('new_state', to_jsonb(s), 'match', to_jsonb(m));
END $$;
REVOKE ALL ON FUNCTION veto_ready(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION veto_ready(uuid, uuid) TO service_role;
