-- Only an authorized match administrator can initiate a coin toss.
CREATE OR REPLACE FUNCTION veto_coin(p_match_id uuid, p_token uuid, p_forced text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $$
DECLARE s match_state%ROWTYPE; m matches%ROWTYPE; team text; winner text;
BEGIN
 SELECT * INTO s FROM match_state WHERE match_id=p_match_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Match state not found'; END IF;
 SELECT * INTO m FROM matches WHERE id=p_match_id;
 SELECT link_type INTO team FROM match_links WHERE match_id=p_match_id AND token=p_token AND (expires_at IS NULL OR expires_at>now());
 IF team IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'Admin link required to trigger coin toss'; END IF;
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
REVOKE ALL ON FUNCTION veto_coin(uuid,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION veto_coin(uuid,uuid,text) TO service_role;
