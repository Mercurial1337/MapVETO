ALTER TABLE matches ADD COLUMN veto_scheduled_at timestamptz,
 ADD COLUMN veto_schedule_enforced boolean NOT NULL DEFAULT false,
 ADD COLUMN veto_schedule_applied_at timestamptz,
 ADD COLUMN veto_no_show_teams text[] NOT NULL DEFAULT '{}';
ALTER TABLE sheet_match_sources ADD COLUMN schedule_overridden boolean NOT NULL DEFAULT false,
 ADD COLUMN schedule_override timestamptz;
CREATE INDEX veto_scheduled_due ON matches(veto_scheduled_at) WHERE veto_schedule_enforced AND veto_schedule_applied_at IS NULL AND status='ready_check';

-- Preserve the importer and its deduplication/password rules. All schedule writes
-- occur inside the same transaction, before a new match becomes visible.
ALTER FUNCTION sheet_apply_day(uuid,uuid,text,bigint,text,jsonb,jsonb) RENAME TO sheet_apply_day_without_schedule;
CREATE FUNCTION sheet_apply_day(p_event uuid,p_user uuid,p_spreadsheet text,p_tab bigint,p_title text,p_rows jsonb,p_choices jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SET search_path=public AS $$
DECLARE r jsonb; c jsonb; saved sheet_match_sources%ROWTYPE; prepared jsonb:='[]'; result jsonb; effective timestamptz; overridden boolean; pending_ids text[]:='{}';
BEGIN
 -- Same event lock as the importer serializes approvals against the worker.
 PERFORM 1 FROM events WHERE id=p_event FOR UPDATE;
 FOR r IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
  SELECT * INTO saved FROM sheet_match_sources WHERE event_id=p_event AND spreadsheet_id=p_spreadsheet AND source_id=r->>'source_id';
  IF NOT COALESCE(saved.was_created,false) THEN pending_ids:=array_append(pending_ids,r->>'source_id'); END IF;
  c:=NULL; IF p_choices IS NOT NULL THEN SELECT value INTO c FROM jsonb_array_elements(p_choices) WHERE value->>'source_id'=r->>'source_id'; END IF;
  overridden:=COALESCE(c ? 'scheduled_at',false) OR COALESCE(saved.schedule_overridden,false);
  effective:=CASE WHEN COALESCE(c ? 'scheduled_at',false) THEN (c->>'scheduled_at')::timestamptz
   WHEN saved.schedule_overridden THEN saved.schedule_override ELSE (r->>'scheduled_at')::timestamptz END;
  IF NOT COALESCE(saved.was_created,false) AND NOT overridden AND COALESCE(r->>'schedule_error','')<>'' THEN
   IF c IS NOT NULL THEN RAISE EXCEPTION 'MapVETO Time for %: %',r->>'source_id',r->>'schedule_error'; END IF;
   r:=r||jsonb_build_object('status','invalid','issue',r->>'schedule_error');
  END IF;
  r:=r||jsonb_build_object('scheduled_at',effective);
  prepared:=prepared||jsonb_build_array(r);
 END LOOP;
 result:=sheet_apply_day_without_schedule(p_event,p_user,p_spreadsheet,p_tab,p_title,prepared,p_choices);
 FOR r IN SELECT value FROM jsonb_array_elements(prepared) LOOP
  SELECT * INTO saved FROM sheet_match_sources WHERE event_id=p_event AND spreadsheet_id=p_spreadsheet AND source_id=r->>'source_id';
  c:=NULL; IF p_choices IS NOT NULL THEN SELECT value INTO c FROM jsonb_array_elements(p_choices) WHERE value->>'source_id'=r->>'source_id'; END IF;
  IF COALESCE(c ? 'scheduled_at',false) AND r->>'source_id'=ANY(pending_ids) THEN
   UPDATE sheet_match_sources SET schedule_overridden=true,schedule_override=(c->>'scheduled_at')::timestamptz WHERE id=saved.id;
  END IF;
  -- Only initialize a schedule on the exact creation captured by this import.
  -- Re-sync never re-arms a cleared schedule or changes an existing match time.
  IF saved.was_created AND saved.match_id IS NOT NULL AND r->>'source_id'=ANY(pending_ids) THEN
   UPDATE matches SET veto_scheduled_at=(r->>'scheduled_at')::timestamptz,veto_schedule_enforced=r->>'scheduled_at' IS NOT NULL WHERE id=saved.match_id;
  END IF;
 END LOOP;
 RETURN result;
END $$;

-- The helpers share match_state's row lock with check-in, selections and reset.
-- Only service_role/pg_cron may call these functions.
CREATE FUNCTION veto_no_show_moves(p_match_id uuid) RETURNS void LANGUAGE plpgsql SET search_path=public AS $$
DECLARE s match_state%ROWTYPE; m matches%ROWTYPE; seq jsonb; action text; team_token uuid; admin_token uuid; selected uuid; chosen_side text; before_log bigint; i integer;
BEGIN
 FOR i IN 1..40 LOOP
  SELECT * INTO s FROM match_state WHERE match_id=p_match_id FOR UPDATE;
  SELECT * INTO m FROM matches WHERE id=p_match_id;
  IF s.is_paused OR s.is_complete OR NOT COALESCE(s.current_turn=ANY(m.veto_no_show_teams),false) THEN RETURN; END IF;
  SELECT COALESCE(max(log_order),0) INTO before_log FROM match_logs WHERE match_id=p_match_id;
  IF m.status='side_selection' THEN
   PERFORM veto_position(p_match_id,NULL,random()<0.5,true,s.turn_started_at);
  ELSIF m.status='in_progress' THEN
   SELECT COALESCE(m.custom_veto_sequence,v.sequence) INTO seq FROM veto_templates v WHERE id=m.veto_template_id;
   action:=seq->'steps'->s.current_step->>'action'; selected:=NULL;chosen_side:=NULL;
   SELECT token INTO team_token FROM match_links WHERE match_id=p_match_id AND link_type=s.current_turn;
   SELECT token INTO admin_token FROM match_links WHERE match_id=p_match_id AND link_type='admin' AND (expires_at IS NULL OR expires_at>now());
   IF admin_token IS NULL THEN RAISE EXCEPTION 'Head Admin automation link unavailable'; END IF;
   IF action IN ('pick','ban') THEN selected:=(s.available_maps->>floor(random()*jsonb_array_length(s.available_maps))::integer)::uuid;
   ELSIF action='side' THEN chosen_side:=CASE WHEN random()<0.5 THEN 'attack' ELSE 'defense' END;
   ELSE RAISE EXCEPTION 'Invalid no-show selection'; END IF;
   PERFORM process_veto_action_before_schedule(p_match_id,team_token,action,selected,chosen_side,true,s.turn_started_at,admin_token);
  ELSE RETURN; END IF;
  UPDATE match_logs SET metadata=COALESCE(metadata,'{}')||jsonb_build_object('scheduled_no_show',true,'timeout',false,'admin_override',false)
   WHERE match_id=p_match_id AND log_order>before_log;
 END LOOP;
 RAISE EXCEPTION 'No-show sequence exceeded safety limit';
END $$;

CREATE FUNCTION veto_apply_schedule(p_match_id uuid) RETURNS boolean LANGUAGE plpgsql SET search_path=public AS $$
DECLARE s match_state%ROWTYPE; m matches%ROWTYPE; absent text[]:='{}'; pool jsonb; picks jsonb:='[]'; bans jsonb:='[]'; map_entry record; count_maps integer; seq jsonb; winner text;
BEGIN
 SELECT * INTO s FROM match_state WHERE match_id=p_match_id FOR UPDATE;
 SELECT * INTO m FROM matches WHERE id=p_match_id;
 IF NOT m.veto_schedule_enforced OR m.veto_scheduled_at IS NULL OR m.veto_schedule_applied_at IS NOT NULL OR m.status<>'ready_check' OR now()<m.veto_scheduled_at+interval '10 minutes' THEN RETURN false; END IF;
 IF NOT s.team_a_ready THEN absent:=array_append(absent,'team_a'); END IF;
 IF NOT s.team_b_ready THEN absent:=array_append(absent,'team_b'); END IF;
 UPDATE matches SET veto_schedule_applied_at=now(),veto_no_show_teams=absent WHERE id=p_match_id;
 INSERT INTO match_logs(match_id,step_number,action_type,actor,metadata) VALUES(p_match_id,-2,'admin_action','system',jsonb_build_object('operation','scheduled_no_show','action_details','Scheduled check-in deadline reached; no-show rules applied','absent_teams',to_jsonb(absent),'scheduled_at',m.veto_scheduled_at,'confirmed_at',now()));
 IF cardinality(absent)=2 THEN
  count_maps:=CASE m.format WHEN 'bo5' THEN 5 WHEN 'bo1' THEN 1 ELSE 3 END;
  SELECT COALESCE(m.custom_veto_sequence,v.sequence) INTO seq FROM veto_templates v WHERE id=m.veto_template_id;
  -- Match's actual pool, never a global list that might have changed later.
  SELECT jsonb_agg(id ORDER BY name COLLATE "C",id) INTO pool FROM maps WHERE id IN(SELECT value::uuid FROM jsonb_array_elements_text(s.available_maps));
  IF COALESCE(jsonb_array_length(pool),0)<count_maps THEN RAISE EXCEPTION 'Not enough maps for no-show result'; END IF;
  FOR map_entry IN SELECT value,ordinality FROM jsonb_array_elements_text(pool) WITH ORDINALITY LOOP
   IF map_entry.ordinality<=count_maps THEN
    picks:=picks||jsonb_build_object('map_id',map_entry.value,'picked_by','system','map_number',map_entry.ordinality,'side',CASE WHEN random()<0.5 THEN 'attack' ELSE 'defense' END,'side_picked_by','team_a','is_auto',true,'side_is_auto',true);
   ELSE bans:=bans||jsonb_build_object('map_id',map_entry.value,'banned_by','system','is_auto',true); END IF;
  END LOOP;
  UPDATE match_state SET available_maps='[]',banned_maps=bans,picked_maps=picks,results=picks,is_complete=true,current_turn=NULL,current_step=jsonb_array_length(seq->'steps'),automation_enabled=true,is_paused=false,actor_mapping='{"team_a":"team_a","team_b":"team_b"}' WHERE match_id=p_match_id;
  UPDATE matches SET status='completed',started_at=now(),completed_at=now() WHERE id=p_match_id;
  INSERT INTO match_logs(match_id,step_number,action_type,actor,map_id,side_choice,metadata)
   SELECT p_match_id,(p->>'map_number')::integer,'pick','system',(p->>'map_id')::uuid,p->>'side',jsonb_build_object('scheduled_no_show',true,'map_number',p->'map_number','action_details','Alphabetical default map; side is Team A starting side') FROM jsonb_array_elements(picks) p;
 ELSIF cardinality(absent)=1 THEN
  winner:=CASE WHEN m.coin_toss_forced AND m.coin_toss_winner IS NOT NULL THEN m.coin_toss_winner ELSE CASE WHEN random()<0.5 THEN 'team_a' ELSE 'team_b' END END;
  UPDATE matches SET status='side_selection',coin_toss_winner=winner WHERE id=p_match_id;
  UPDATE match_state SET automation_enabled=true,current_turn=winner,turn_started_at=now() WHERE match_id=p_match_id;
  INSERT INTO match_logs(match_id,step_number,action_type,actor,metadata) VALUES(p_match_id,-1,'coin_toss',winner,jsonb_build_object('is_seeded',m.coin_toss_forced,'automatic_coin_toss',NOT m.coin_toss_forced,'confirmed_at',now()));
  PERFORM veto_no_show_moves(p_match_id);
 END IF;
 RETURN true;
END $$;

ALTER FUNCTION veto_ready(uuid,uuid) RENAME TO veto_ready_before_schedule;
CREATE FUNCTION veto_ready(p_match_id uuid,p_token uuid) RETURNS jsonb LANGUAGE plpgsql SET search_path=public AS $$
DECLARE m matches%ROWTYPE; team text;
BEGIN
 PERFORM 1 FROM match_state WHERE match_id=p_match_id FOR UPDATE;
 SELECT link_type INTO team FROM match_links WHERE match_id=p_match_id AND token=p_token AND link_type IN ('team_a','team_b') AND (expires_at IS NULL OR expires_at>now());
 IF team IS NULL THEN RAISE EXCEPTION 'Valid team link required'; END IF;
 SELECT * INTO m FROM matches WHERE id=p_match_id;
 IF m.veto_schedule_enforced AND now()<m.veto_scheduled_at THEN RAISE EXCEPTION 'Check-in has not opened yet (GMT+3)'; END IF;
 IF m.veto_schedule_enforced AND now()>=m.veto_scheduled_at+interval '10 minutes' AND m.status='ready_check' THEN
  PERFORM veto_apply_schedule(p_match_id);
  RETURN jsonb_build_object('new_state',(SELECT to_jsonb(s) FROM match_state s WHERE match_id=p_match_id),'match',(SELECT to_jsonb(x) FROM matches x WHERE id=p_match_id));
 END IF;
 IF team=ANY(m.veto_no_show_teams) THEN RAISE EXCEPTION 'Check-in deadline missed. Head Admin must restart the entire veto to restore team choices.'; END IF;
 RETURN veto_ready_before_schedule(p_match_id,p_token);
END $$;

ALTER FUNCTION process_veto_action(uuid,uuid,text,uuid,text,boolean,timestamptz,uuid) RENAME TO process_veto_action_before_schedule;
CREATE FUNCTION process_veto_action(p_match_id uuid,p_token uuid,p_action text,p_map_id uuid DEFAULT NULL,p_side_choice text DEFAULT NULL,p_is_auto boolean DEFAULT false,p_expected timestamptz DEFAULT NULL,p_admin_token uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SET search_path=public AS $$
DECLARE result jsonb; team text;
BEGIN
 PERFORM 1 FROM match_state WHERE match_id=p_match_id FOR UPDATE;
 SELECT link_type INTO team FROM match_links WHERE match_id=p_match_id AND token=p_token;
 IF NOT p_is_auto AND p_admin_token IS NULL AND EXISTS(SELECT 1 FROM matches WHERE id=p_match_id AND team=ANY(veto_no_show_teams)) THEN RAISE EXCEPTION 'No-show choices are automatic until Head Admin restarts the entire veto'; END IF;
 result:=process_veto_action_before_schedule(p_match_id,p_token,p_action,p_map_id,p_side_choice,p_is_auto,p_expected,p_admin_token);
 PERFORM veto_no_show_moves(p_match_id);
 RETURN (SELECT to_jsonb(s) FROM match_state s WHERE match_id=p_match_id);
END $$;

-- Position selection already owns the row lock. Permit service-only no-show
-- automation immediately; late team submissions remain blocked.
DO $$ DECLARE definition text; BEGIN
 SELECT pg_get_functiondef('veto_position(uuid,uuid,boolean,boolean,timestamptz)'::regprocedure) INTO definition;
 definition:=replace(definition,'now() < s.turn_started_at+interval ''60 seconds''','(now() < s.turn_started_at+interval ''60 seconds'' AND NOT COALESCE(m.coin_toss_winner=ANY(m.veto_no_show_teams),false))');
 definition:=replace(definition,'IF now() >= s.turn_started_at+interval ''60 seconds'' THEN','IF team=ANY(m.veto_no_show_teams) THEN RAISE EXCEPTION ''No-show choices are automatic until Head Admin restarts the entire veto''; END IF; IF now() >= s.turn_started_at+interval ''60 seconds'' THEN');
 definition:=replace(definition,'RETURN jsonb_build_object(''new_state'',to_jsonb(s),''match'',to_jsonb(m));','PERFORM veto_no_show_moves(p_match_id); SELECT * INTO s FROM match_state WHERE match_id=p_match_id; SELECT * INTO m FROM matches WHERE id=p_match_id; RETURN jsonb_build_object(''new_state'',to_jsonb(s),''match'',to_jsonb(m));');
 EXECUTE definition;
END $$;

ALTER FUNCTION veto_expired_turns() RENAME TO veto_expired_turns_before_schedule;
CREATE FUNCTION veto_expired_turns() RETURNS integer LANGUAGE plpgsql SET search_path=public AS $$
DECLARE due record; processed integer:=0;
BEGIN
 FOR due IN SELECT m.id FROM matches m JOIN match_state s ON s.match_id=m.id
  WHERE m.veto_schedule_enforced AND m.veto_schedule_applied_at IS NULL AND m.status='ready_check' AND m.veto_scheduled_at<=now()-interval '10 minutes'
  ORDER BY m.veto_scheduled_at LIMIT 100 FOR UPDATE OF s SKIP LOCKED
 LOOP
  BEGIN PERFORM veto_apply_schedule(due.id);processed:=processed+1;
  EXCEPTION WHEN OTHERS THEN RAISE WARNING 'Scheduled veto % failed: %',due.id,SQLERRM; END;
 END LOOP;
 FOR due IN SELECT m.id FROM matches m JOIN match_state s ON s.match_id=m.id WHERE s.current_turn=ANY(m.veto_no_show_teams) AND NOT s.is_paused AND NOT s.is_complete AND m.status IN ('in_progress','side_selection') LIMIT 100 FOR UPDATE OF s SKIP LOCKED LOOP
  PERFORM veto_no_show_moves(due.id);
 END LOOP;
 RETURN processed+veto_expired_turns_before_schedule();
END $$;

ALTER FUNCTION veto_admin(uuid,uuid,text,uuid,text,text,timestamptz) RENAME TO veto_admin_before_schedule;
CREATE FUNCTION veto_admin(p_match_id uuid,p_token uuid,p_operation text,p_map_id uuid DEFAULT NULL,p_side text DEFAULT NULL,p_reason text DEFAULT '',p_expected timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
 result:=veto_admin_before_schedule(p_match_id,p_token,p_operation,p_map_id,p_side,p_reason,p_expected);
 IF p_operation='reset' THEN
  UPDATE matches SET veto_schedule_enforced=false,veto_scheduled_at=NULL,veto_schedule_applied_at=NULL,veto_no_show_teams='{}' WHERE id=p_match_id;
  result:=result||jsonb_build_object('match',(SELECT to_jsonb(m) FROM matches m WHERE id=p_match_id));
 END IF;
 RETURN result;
END $$;

-- Explicit grants on both wrappers and renamed entry points: no public RPC path.
REVOKE ALL ON FUNCTION sheet_apply_day(uuid,uuid,text,bigint,text,jsonb,jsonb),veto_no_show_moves(uuid),veto_apply_schedule(uuid),veto_ready(uuid,uuid),process_veto_action(uuid,uuid,text,uuid,text,boolean,timestamptz,uuid),veto_expired_turns(),veto_admin(uuid,uuid,text,uuid,text,text,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION sheet_apply_day(uuid,uuid,text,bigint,text,jsonb,jsonb),veto_no_show_moves(uuid),veto_apply_schedule(uuid),veto_ready(uuid,uuid),process_veto_action(uuid,uuid,text,uuid,text,boolean,timestamptz,uuid),veto_expired_turns(),veto_admin(uuid,uuid,text,uuid,text,text,timestamptz) TO service_role;
NOTIFY pgrst,'reload schema';
