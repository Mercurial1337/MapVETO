CREATE OR REPLACE FUNCTION veto_admin(p_match_id uuid,p_token uuid,p_operation text,p_map_id uuid DEFAULT NULL,p_side text DEFAULT NULL,p_reason text DEFAULT '',p_expected timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SET search_path=public AS $$
DECLARE s match_state%ROWTYPE; m matches%ROWTYPE; snap veto_snapshots%ROWTYPE; seq jsonb; action text; team_token uuid; result jsonb; maps jsonb; admin_id uuid;
BEGIN
 SELECT id INTO admin_id FROM match_links WHERE match_id=p_match_id AND token=p_token AND link_type='admin' AND (expires_at IS NULL OR expires_at>now());
 IF admin_id IS NULL THEN RAISE EXCEPTION 'Admin link required'; END IF;
 IF length(trim(p_reason))=0 OR length(p_reason)>500 THEN RAISE EXCEPTION 'A reason is required (maximum 500 characters)'; END IF;
 SELECT * INTO s FROM match_state WHERE match_id=p_match_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Match state not found'; END IF;
 SELECT * INTO m FROM matches WHERE id=p_match_id;
 IF p_expected IS NOT NULL AND p_expected IS DISTINCT FROM s.turn_started_at THEN RAISE EXCEPTION 'Turn changed; refresh before overriding'; END IF;
 IF p_operation IN ('pause','resume','restart') THEN
  IF m.status NOT IN ('in_progress','side_selection','coin_toss') THEN RAISE EXCEPTION 'No active veto'; END IF;
  IF p_operation='pause' THEN
   IF NOT s.is_paused THEN
    UPDATE match_state SET is_paused=true,paused_remaining_seconds=greatest(0,60-extract(epoch from now()-turn_started_at)) WHERE match_id=p_match_id;
   END IF;
  ELSIF p_operation='resume' THEN
   IF s.is_paused THEN
    UPDATE match_state SET is_paused=false,turn_started_at=now()-make_interval(secs=>60-COALESCE(paused_remaining_seconds,60)),paused_remaining_seconds=NULL WHERE match_id=p_match_id;
   END IF;
  ELSE
   UPDATE match_state SET turn_started_at=now(),paused_remaining_seconds=CASE WHEN is_paused THEN 60 ELSE NULL END WHERE match_id=p_match_id;
  END IF;
 ELSIF p_operation IN ('undo','correct') THEN
  SELECT * INTO snap FROM veto_snapshots WHERE match_id=p_match_id AND NOT undone ORDER BY id DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'No selection available to reopen'; END IF;
  UPDATE match_state SET
   current_step=(snap.state->>'current_step')::int,current_turn=snap.state->>'current_turn',
   available_maps=snap.state->'available_maps',banned_maps=snap.state->'banned_maps',picked_maps=snap.state->'picked_maps',
   results=snap.state->'results',is_complete=false,actor_mapping=snap.state->'actor_mapping',turn_started_at=now(),
   paused_remaining_seconds=CASE WHEN is_paused THEN 60 ELSE NULL END WHERE match_id=p_match_id;
  UPDATE matches SET status='in_progress',completed_at=NULL WHERE id=p_match_id;
  UPDATE veto_snapshots SET undone=true WHERE id=snap.id;
  UPDATE match_logs SET metadata=metadata || jsonb_build_object('superseded',true) WHERE match_id=p_match_id AND metadata->>'snapshot_id'=snap.id::text;
  IF p_operation='correct' THEN
   result:=veto_admin(p_match_id,p_token,'force',p_map_id,p_side,p_reason,NULL);
  END IF;
 ELSIF p_operation='force' THEN
  IF m.status <> 'in_progress' THEN RAISE EXCEPTION 'Match not in progress'; END IF;
  SELECT COALESCE(m.custom_veto_sequence,vt.sequence) INTO seq FROM veto_templates vt WHERE id=m.veto_template_id;
  action:=seq->'steps'->s.current_step->>'action';
  IF action NOT IN ('ban','pick','side') THEN RAISE EXCEPTION 'Invalid forced action'; END IF;
  IF action IN ('ban','pick') AND p_map_id IS NULL THEN RAISE EXCEPTION 'Choose a map to force'; END IF;
  IF action='side' AND (p_side IS NULL OR p_side NOT IN ('attack','defense')) THEN RAISE EXCEPTION 'Choose a side to force'; END IF;
  SELECT token INTO team_token FROM match_links WHERE match_id=p_match_id AND link_type=s.current_turn;
  result:=process_veto_action(p_match_id,team_token,action,p_map_id,p_side,false,NULL,p_token);
 ELSIF p_operation='reset' THEN
  SELECT COALESCE(jsonb_agg(DISTINCT map_id),'[]'::jsonb) INTO maps FROM (
   SELECT value AS map_id FROM jsonb_array_elements(s.available_maps)
   UNION ALL SELECT value->'map_id' FROM jsonb_array_elements(s.banned_maps)
   UNION ALL SELECT value->'map_id' FROM jsonb_array_elements(s.picked_maps)
  ) pool;
  UPDATE matches SET status='ready_check',coin_toss_winner=CASE WHEN coin_toss_forced THEN coin_toss_winner ELSE NULL END,started_at=NULL,completed_at=NULL WHERE id=p_match_id;
  UPDATE match_state SET current_step=0,current_turn=NULL,available_maps=maps,banned_maps='[]',picked_maps='[]',results='[]',is_complete=false,
   is_paused=false,paused_remaining_seconds=NULL,team_a_ready=false,team_b_ready=false,team_a_ready_at=NULL,team_b_ready_at=NULL,actor_mapping=NULL,turn_started_at=now() WHERE match_id=p_match_id;
  UPDATE veto_snapshots SET undone=true WHERE match_id=p_match_id;
  UPDATE match_logs SET metadata=COALESCE(metadata,'{}') || jsonb_build_object('previous_session',true) WHERE match_id=p_match_id;
 ELSE RAISE EXCEPTION 'Invalid admin operation'; END IF;
 INSERT INTO match_logs(match_id,step_number,action_type,actor,map_id,side_choice,metadata)
 VALUES(p_match_id,s.current_step,'admin_action','admin',p_map_id,p_side,jsonb_build_object('operation',p_operation,'action_details',p_operation || ': ' || p_reason,'reason',p_reason,'admin_link_id',admin_id,'confirmed_at',now()));
 SELECT * INTO s FROM match_state WHERE match_id=p_match_id;
 SELECT * INTO m FROM matches WHERE id=p_match_id;
 RETURN jsonb_build_object('new_state',to_jsonb(s),'match',to_jsonb(m));
END $$;
REVOKE ALL ON FUNCTION veto_admin(uuid,uuid,text,uuid,text,text,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION veto_admin(uuid,uuid,text,uuid,text,text,timestamptz) TO service_role;
