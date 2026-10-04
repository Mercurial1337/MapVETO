-- Team incident reports are independent of move-clock expiry and referee pauses.
CREATE TABLE IF NOT EXISTS veto_timeout_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 match_id uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
 actor text NOT NULL CHECK(actor IN ('team_a','team_b')),
 reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 1000),
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved')),
 created_at timestamptz NOT NULL DEFAULT now(),
 resolved_at timestamptz,
 resolved_by uuid REFERENCES match_links(id) ON DELETE SET NULL,
 resolution text,
 CHECK ((status='open' AND resolved_at IS NULL AND resolution IS NULL) OR
        (status='resolved' AND resolved_at IS NOT NULL AND length(trim(resolution)) BETWEEN 1 AND 1000))
);
CREATE UNIQUE INDEX IF NOT EXISTS veto_timeout_one_open_per_team ON veto_timeout_requests(match_id,actor) WHERE status='open';
ALTER TABLE veto_timeout_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON veto_timeout_requests FROM PUBLIC,anon,authenticated;
GRANT ALL ON veto_timeout_requests TO service_role;

CREATE OR REPLACE FUNCTION veto_request_timeout(p_match_id uuid,p_token uuid,p_reason text,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SET search_path=public AS $$
DECLARE s match_state%ROWTYPE; m matches%ROWTYPE; team text; report veto_timeout_requests%ROWTYPE;
BEGIN
 SELECT link_type INTO team FROM match_links WHERE match_id=p_match_id AND token=p_token AND (expires_at IS NULL OR expires_at>now());
 IF team IS NULL OR team NOT IN ('team_a','team_b') THEN RAISE EXCEPTION 'Valid team link required'; END IF;
 IF p_reason IS NULL OR length(trim(p_reason)) NOT BETWEEN 1 AND 1000 OR p_request_id IS NULL THEN RAISE EXCEPTION 'Describe the problem (maximum 1000 characters)'; END IF;
 SELECT * INTO s FROM match_state WHERE match_id=p_match_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Match state not found'; END IF;
 SELECT * INTO m FROM matches WHERE id=p_match_id;
 SELECT * INTO report FROM veto_timeout_requests WHERE id=p_request_id;
 IF FOUND THEN
  IF report.match_id<>p_match_id OR report.actor<>team OR report.reason<>trim(p_reason) THEN RAISE EXCEPTION 'Request ID already used'; END IF;
  RETURN jsonb_build_object('new_state',to_jsonb(s),'match',to_jsonb(m),'request',to_jsonb(report));
 END IF;
 IF m.status NOT IN ('ready_check','coin_toss','side_selection','in_progress') THEN RAISE EXCEPTION 'Timeout requests are only available during an active veto session'; END IF;
 IF EXISTS(SELECT 1 FROM veto_timeout_requests WHERE match_id=p_match_id AND actor=team AND status='open') THEN RAISE EXCEPTION 'Your team already has an open timeout request'; END IF;
 INSERT INTO veto_timeout_requests(id,match_id,actor,reason) VALUES(p_request_id,p_match_id,team,trim(p_reason)) RETURNING * INTO report;
 INSERT INTO match_logs(match_id,step_number,action_type,actor,metadata)
 VALUES(p_match_id,s.current_step,'timeout_request',team,jsonb_build_object('timeout_request_id',report.id,'reason',report.reason,'confirmed_at',report.created_at));
 RETURN jsonb_build_object('new_state',to_jsonb(s),'match',to_jsonb(m),'request',to_jsonb(report));
END $$;

CREATE OR REPLACE FUNCTION veto_resolve_timeout(p_match_id uuid,p_token uuid,p_request_id uuid,p_resolution text)
RETURNS jsonb LANGUAGE plpgsql SET search_path=public AS $$
DECLARE s match_state%ROWTYPE; m matches%ROWTYPE; admin_id uuid; report veto_timeout_requests%ROWTYPE;
BEGIN
 SELECT id INTO admin_id FROM match_links WHERE match_id=p_match_id AND token=p_token AND link_type='admin' AND (expires_at IS NULL OR expires_at>now());
 IF admin_id IS NULL THEN RAISE EXCEPTION 'Admin link required'; END IF;
 IF p_resolution IS NULL OR length(trim(p_resolution)) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'Describe the resolution (maximum 1000 characters)'; END IF;
 SELECT * INTO s FROM match_state WHERE match_id=p_match_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Match state not found'; END IF;
 SELECT * INTO m FROM matches WHERE id=p_match_id;
 SELECT * INTO report FROM veto_timeout_requests WHERE id=p_request_id AND match_id=p_match_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Timeout request not found'; END IF;
 IF report.status='resolved' THEN
  IF report.resolved_by IS DISTINCT FROM admin_id OR report.resolution<>trim(p_resolution) THEN RAISE EXCEPTION 'Timeout request already resolved'; END IF;
  RETURN jsonb_build_object('new_state',to_jsonb(s),'match',to_jsonb(m),'request',to_jsonb(report));
 END IF;
 UPDATE veto_timeout_requests SET status='resolved',resolved_at=now(),resolved_by=admin_id,resolution=trim(p_resolution) WHERE id=report.id RETURNING * INTO report;
 INSERT INTO match_logs(match_id,step_number,action_type,actor,metadata)
 VALUES(p_match_id,s.current_step,'timeout_resolved','admin',jsonb_build_object('timeout_request_id',report.id,'request_actor',report.actor,'resolution',report.resolution,'admin_link_id',admin_id,'confirmed_at',report.resolved_at));
 RETURN jsonb_build_object('new_state',to_jsonb(s),'match',to_jsonb(m),'request',to_jsonb(report));
END $$;
REVOKE ALL ON FUNCTION veto_request_timeout(uuid,uuid,text,uuid),veto_resolve_timeout(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION veto_request_timeout(uuid,uuid,text,uuid),veto_resolve_timeout(uuid,uuid,uuid,text) TO service_role;
