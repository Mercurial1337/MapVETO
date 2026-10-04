CREATE OR REPLACE FUNCTION veto_timeout(p_match_id uuid,p_token uuid,p_expected timestamptz)
RETURNS jsonb LANGUAGE plpgsql SET search_path=public AS $$
DECLARE s match_state%ROWTYPE; m matches%ROWTYPE; seq jsonb; action text; team_token uuid; map_id uuid; side text; new_state jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM match_links WHERE match_id=p_match_id AND token=p_token AND (expires_at IS NULL OR expires_at>now())) THEN RAISE EXCEPTION 'Valid match link required'; END IF;
 SELECT * INTO s FROM match_state WHERE match_id=p_match_id FOR UPDATE;
 SELECT * INTO m FROM matches WHERE id=p_match_id;
 IF s.is_paused OR s.is_complete OR m.status NOT IN ('in_progress','side_selection') THEN RAISE EXCEPTION 'No active timer'; END IF;
 IF p_expected IS DISTINCT FROM s.turn_started_at OR now()<s.turn_started_at+interval '60 seconds' THEN RAISE EXCEPTION 'Timer has not expired or turn changed'; END IF;
 IF m.status='side_selection' THEN RETURN veto_position(p_match_id,NULL,random()<0.5,true,p_expected); END IF;
 SELECT COALESCE(m.custom_veto_sequence,vt.sequence) INTO seq FROM veto_templates vt WHERE id=m.veto_template_id;
 action:=seq->'steps'->s.current_step->>'action';
 SELECT token INTO team_token FROM match_links WHERE match_id=p_match_id AND link_type=s.current_turn;
 IF action IN ('pick','ban') THEN
   map_id := (s.available_maps->>floor(random()*jsonb_array_length(s.available_maps))::int)::uuid;
 ELSIF action='side' THEN side:=CASE WHEN random()<0.5 THEN 'attack' ELSE 'defense' END;
 ELSE RAISE EXCEPTION 'Invalid timeout action'; END IF;
 new_state:=process_veto_action(p_match_id,team_token,action,map_id,side,true,p_expected);
 SELECT * INTO m FROM matches WHERE id=p_match_id;
 RETURN jsonb_build_object('new_state',new_state,'match',to_jsonb(m));
END $$;
REVOKE ALL ON FUNCTION veto_timeout(uuid,uuid,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION veto_timeout(uuid,uuid,timestamptz) TO service_role;
