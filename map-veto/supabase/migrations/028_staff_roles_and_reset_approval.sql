-- Existing admin links/memberships retain Head Admin authority.
DO $$ DECLARE c record; BEGIN
 FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='event_admins'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%role%' LOOP
  EXECUTE format('ALTER TABLE event_admins DROP CONSTRAINT %I',c.conname);
 END LOOP;
 FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='match_links'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%link_type%' LOOP
  EXECUTE format('ALTER TABLE match_links DROP CONSTRAINT %I',c.conname);
 END LOOP;
END $$;
ALTER TABLE event_admins ADD CONSTRAINT event_admins_role_check CHECK(role IN ('admin','referee'));
ALTER TABLE match_links ADD CONSTRAINT match_links_link_type_check CHECK(link_type IN ('team_a','team_b','observer','admin','referee'));
CREATE FUNCTION create_referee_match_link() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
 INSERT INTO match_links(match_id,link_type) VALUES(NEW.id,'referee') ON CONFLICT DO NOTHING; RETURN NEW;
END $$;
CREATE TRIGGER create_referee_link AFTER INSERT ON matches FOR EACH ROW EXECUTE FUNCTION create_referee_match_link();
INSERT INTO match_links(match_id,link_type) SELECT id,'referee' FROM matches ON CONFLICT DO NOTHING;

CREATE TABLE veto_reset_requests (
 id uuid PRIMARY KEY,
 match_id uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
 requested_by uuid REFERENCES match_links(id) ON DELETE SET NULL,
 reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 500),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','cancelled')),
 team_a_approved_at timestamptz,
 team_b_approved_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 resolved_at timestamptz
);
CREATE UNIQUE INDEX one_pending_reset_per_match ON veto_reset_requests(match_id) WHERE status='pending';
ALTER TABLE veto_reset_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON veto_reset_requests FROM PUBLIC,anon,authenticated;
GRANT ALL ON veto_reset_requests TO service_role;

-- A Head Admin reset invalidates any outstanding team approvals.
ALTER FUNCTION veto_admin(uuid,uuid,text,uuid,text,text,timestamptz) RENAME TO veto_admin_internal;
CREATE FUNCTION veto_admin(p_match_id uuid,p_token uuid,p_operation text,p_map_id uuid DEFAULT NULL,p_side text DEFAULT NULL,p_reason text DEFAULT '',p_expected timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SET search_path=public AS $$ DECLARE result jsonb; BEGIN
 result:=veto_admin_internal(p_match_id,p_token,p_operation,p_map_id,p_side,p_reason,p_expected);
 IF p_operation='reset' THEN
  UPDATE veto_reset_requests SET status='cancelled',resolved_at=now() WHERE match_id=p_match_id AND status='pending';
 END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION veto_admin(uuid,uuid,text,uuid,text,text,timestamptz),veto_admin_internal(uuid,uuid,text,uuid,text,text,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION veto_admin(uuid,uuid,text,uuid,text,text,timestamptz),veto_admin_internal(uuid,uuid,text,uuid,text,text,timestamptz) TO service_role;

CREATE FUNCTION veto_request_reset(p_match_id uuid,p_token uuid,p_request_id uuid,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SET search_path=public AS $$
DECLARE requester uuid; r veto_reset_requests%ROWTYPE; BEGIN
 SELECT id INTO requester FROM match_links WHERE match_id=p_match_id AND token=p_token AND link_type='referee' AND (expires_at IS NULL OR expires_at>now());
 IF requester IS NULL THEN RAISE EXCEPTION 'Referee link required'; END IF;
 IF p_request_id IS NULL OR length(trim(COALESCE(p_reason,''))) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Enter a reset reason (maximum 500 characters)'; END IF;
 PERFORM 1 FROM match_state WHERE match_id=p_match_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Match state not found'; END IF;
 SELECT * INTO r FROM veto_reset_requests WHERE id=p_request_id;
 IF FOUND THEN
  IF r.match_id<>p_match_id OR r.requested_by IS DISTINCT FROM requester OR r.reason<>trim(p_reason) THEN RAISE EXCEPTION 'Request ID already used'; END IF;
  RETURN to_jsonb(r);
 END IF;
 IF EXISTS(SELECT 1 FROM veto_reset_requests WHERE match_id=p_match_id AND status='pending') THEN RAISE EXCEPTION 'A reset request is already pending'; END IF;
 INSERT INTO veto_reset_requests(id,match_id,requested_by,reason) VALUES(p_request_id,p_match_id,requester,trim(p_reason)) RETURNING * INTO r;
 INSERT INTO match_logs(match_id,step_number,action_type,actor,metadata) VALUES(p_match_id,-3,'reset_request','admin',jsonb_build_object('request_id',r.id,'reason',r.reason,'staff_role','referee','confirmed_at',now()));
 RETURN to_jsonb(r);
END $$;

CREATE FUNCTION veto_answer_reset(p_match_id uuid,p_token uuid,p_request_id uuid,p_approve boolean)
RETURNS jsonb LANGUAGE plpgsql SET search_path=public AS $$
DECLARE team text; r veto_reset_requests%ROWTYPE; head_token uuid; BEGIN
 SELECT link_type INTO team FROM match_links WHERE match_id=p_match_id AND token=p_token AND link_type IN ('team_a','team_b') AND (expires_at IS NULL OR expires_at>now());
 IF team IS NULL THEN RAISE EXCEPTION 'Valid team link required'; END IF;
 IF p_approve IS NULL THEN RAISE EXCEPTION 'Choose approve or decline'; END IF;
 PERFORM 1 FROM match_state WHERE match_id=p_match_id FOR UPDATE;
 SELECT * INTO r FROM veto_reset_requests WHERE id=p_request_id AND match_id=p_match_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Reset request not found'; END IF;
 IF r.status<>'pending' THEN RETURN to_jsonb(r); END IF;
 IF (team='team_a' AND r.team_a_approved_at IS NOT NULL) OR (team='team_b' AND r.team_b_approved_at IS NOT NULL) THEN RETURN to_jsonb(r); END IF;
 IF NOT p_approve THEN
  UPDATE veto_reset_requests SET status='rejected',resolved_at=now() WHERE id=r.id RETURNING * INTO r;
 ELSE
  UPDATE veto_reset_requests SET team_a_approved_at=CASE WHEN team='team_a' THEN now() ELSE team_a_approved_at END,
   team_b_approved_at=CASE WHEN team='team_b' THEN now() ELSE team_b_approved_at END WHERE id=r.id RETURNING * INTO r;
 END IF;
 INSERT INTO match_logs(match_id,step_number,action_type,actor,metadata) VALUES(p_match_id,-3,'reset_answer',team,jsonb_build_object('request_id',r.id,'approved',p_approve,'confirmed_at',now()));
 IF r.team_a_approved_at IS NOT NULL AND r.team_b_approved_at IS NOT NULL THEN
  SELECT token INTO head_token FROM match_links WHERE match_id=p_match_id AND link_type='admin' AND (expires_at IS NULL OR expires_at>now());
  IF head_token IS NULL THEN RAISE EXCEPTION 'Head Admin reset link unavailable'; END IF;
  UPDATE veto_reset_requests SET status='approved',resolved_at=now() WHERE id=r.id RETURNING * INTO r;
  PERFORM veto_admin(p_match_id,head_token,'reset',NULL,NULL,'Both teams approved referee reset: ' || left(r.reason,440),NULL);
  UPDATE match_logs SET metadata=metadata || jsonb_build_object('staff_role','referee','request_id',r.id,'team_approved',true)
   WHERE match_id=p_match_id AND log_order=(SELECT max(log_order) FROM match_logs WHERE match_id=p_match_id);
 END IF;
 RETURN to_jsonb(r);
END $$;
REVOKE ALL ON FUNCTION veto_request_reset(uuid,uuid,uuid,text),veto_answer_reset(uuid,uuid,uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION veto_request_reset(uuid,uuid,uuid,text),veto_answer_reset(uuid,uuid,uuid,boolean) TO service_role;

-- The service-only importer also checks that membership grants Head Admin access.
DO $$ DECLARE definition text; BEGIN
 SELECT pg_get_functiondef('bulk_create_matches(uuid,uuid,uuid,text,uuid,jsonb,uuid[])'::regprocedure) INTO definition;
 definition:=replace(definition,'event_id=p_event_id AND user_id=p_user_id','event_id=p_event_id AND user_id=p_user_id AND role=''admin''');
 EXECUTE definition;
END $$;
