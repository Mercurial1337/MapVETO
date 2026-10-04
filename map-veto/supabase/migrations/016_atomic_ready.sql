ALTER TABLE match_state ADD COLUMN IF NOT EXISTS turn_started_at timestamptz NOT NULL DEFAULT now();
-- Atomic check-in: lock the state before reading readiness or match status.
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
    UPDATE match_state SET turn_started_at=now(), current_turn=m.coin_toss_winner WHERE match_id=p_match_id RETURNING * INTO s;
    IF m.status = 'side_selection' THEN
      INSERT INTO match_logs(match_id, step_number, action_type, actor, metadata)
        VALUES(p_match_id, -1, 'coin_toss', m.coin_toss_winner,
          jsonb_build_object('is_seeded', true, 'selection_method', 'higher_seed'));
    END IF;
  END IF;
  RETURN jsonb_build_object('new_state', to_jsonb(s), 'match', to_jsonb(m));
END $$;
REVOKE ALL ON FUNCTION veto_ready(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION veto_ready(uuid, uuid) TO service_role;
