-- A dedicated clock avoids resetting turns on unrelated state changes.
ALTER TABLE match_state ADD COLUMN IF NOT EXISTS turn_started_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE match_state ADD COLUMN IF NOT EXISTS paused_remaining_seconds double precision;
CREATE OR REPLACE FUNCTION veto_coin(p_match_id uuid, p_token uuid, p_forced text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $$
DECLARE s match_state%ROWTYPE; m matches%ROWTYPE; team text; winner text;
BEGIN
 SELECT * INTO s FROM match_state WHERE match_id=p_match_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Match state not found'; END IF;
 SELECT * INTO m FROM matches WHERE id=p_match_id;
 SELECT link_type INTO team FROM match_links WHERE match_id=p_match_id AND token=p_token AND (expires_at IS NULL OR expires_at>now());
 IF team IS NULL OR team NOT IN ('team_a','team_b','admin') THEN RAISE EXCEPTION 'Valid team or admin link required'; END IF;
 IF p_forced IS NOT NULL AND (team <> 'admin' OR p_forced NOT IN ('team_a','team_b')) THEN RAISE EXCEPTION 'Admin link required for forced result'; END IF;
 IF m.status <> 'coin_toss' OR NOT s.team_a_ready OR NOT s.team_b_ready THEN RAISE EXCEPTION 'Coin toss is not available'; END IF;
 IF s.is_paused THEN RAISE EXCEPTION 'Veto is paused'; END IF;
 winner := COALESCE(p_forced, CASE WHEN random()<0.5 THEN 'team_a' ELSE 'team_b' END);
 UPDATE matches SET coin_toss_winner=winner, status='side_selection' WHERE id=p_match_id RETURNING * INTO m;
 UPDATE match_state SET turn_started_at=now(), current_turn=winner WHERE match_id=p_match_id RETURNING * INTO s;
 INSERT INTO match_logs(match_id,step_number,action_type,actor,metadata) VALUES(p_match_id,-1,'coin_toss',winner,jsonb_build_object('selection_method','coin_toss','forced_by_admin',p_forced IS NOT NULL,'confirmed_at',now()));
 IF p_forced IS NOT NULL THEN
  INSERT INTO match_logs(match_id,step_number,action_type,actor,metadata) VALUES(p_match_id,-1,'admin_action','admin',jsonb_build_object('action_details','Forced coin toss result','winner',winner));
 END IF;
 RETURN jsonb_build_object('new_state',to_jsonb(s),'match',to_jsonb(m),'winner',winner);
END $$;
CREATE OR REPLACE FUNCTION veto_position(p_match_id uuid, p_token uuid, p_first boolean, p_auto boolean DEFAULT false, p_expected timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $$
DECLARE s match_state%ROWTYPE; m matches%ROWTYPE; team text; mapping jsonb; first_actor text; seq jsonb;
BEGIN
 SELECT * INTO s FROM match_state WHERE match_id=p_match_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Match state not found'; END IF;
 SELECT * INTO m FROM matches WHERE id=p_match_id;
 IF m.status <> 'side_selection' THEN RAISE EXCEPTION 'Position selection is not available'; END IF;
 IF s.is_paused THEN RAISE EXCEPTION 'Veto is paused'; END IF;
 IF p_auto THEN
  IF p_expected IS DISTINCT FROM s.turn_started_at OR now() < s.turn_started_at+interval '60 seconds' THEN RAISE EXCEPTION 'Timer has not expired or turn changed'; END IF;
  team := m.coin_toss_winner;
 ELSE
  SELECT link_type INTO team FROM match_links WHERE match_id=p_match_id AND token=p_token AND (expires_at IS NULL OR expires_at>now());
  IF team IS NULL OR team NOT IN ('team_a','team_b') OR team <> m.coin_toss_winner THEN RAISE EXCEPTION 'Only the selected team can choose Team A or B'; END IF;
  IF now() >= s.turn_started_at+interval '60 seconds' THEN RAISE EXCEPTION 'Selection deadline has passed'; END IF;
 END IF;
 mapping := jsonb_build_object(team,CASE WHEN p_first THEN 'team_a' ELSE 'team_b' END,
   CASE WHEN team='team_a' THEN 'team_b' ELSE 'team_a' END,CASE WHEN p_first THEN 'team_b' ELSE 'team_a' END);
 SELECT COALESCE(m.custom_veto_sequence,vt.sequence) INTO seq FROM veto_templates vt WHERE id=m.veto_template_id;
 SELECT key INTO first_actor FROM jsonb_each_text(mapping) WHERE value=seq->'steps'->0->>'actor';
 IF first_actor IS NULL THEN RAISE EXCEPTION 'First veto step must have a team actor'; END IF;
 UPDATE matches SET status='in_progress',started_at=now() WHERE id=p_match_id RETURNING * INTO m;
 UPDATE match_state SET actor_mapping=mapping,current_turn=first_actor,turn_started_at=now() WHERE match_id=p_match_id RETURNING * INTO s;
 INSERT INTO match_logs(match_id,step_number,action_type,actor,metadata) VALUES(p_match_id,-1,'position_choice',team,
   jsonb_build_object('pick_first',p_first,'actor_mapping',mapping,'first_picker',first_actor,'is_auto',p_auto,'timeout',p_auto,'confirmed_at',now()));
 RETURN jsonb_build_object('new_state',to_jsonb(s),'match',to_jsonb(m));
END $$;
REVOKE ALL ON FUNCTION veto_coin(uuid,uuid,text), veto_position(uuid,uuid,boolean,boolean,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION veto_coin(uuid,uuid,text), veto_position(uuid,uuid,boolean,boolean,timestamptz) TO service_role;
