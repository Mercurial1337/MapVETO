-- Staff acknowledge a team timeout request separately from resolving it. Acknowledging
-- stops browser reminders for every staff tab; it never pauses or resumes the veto.
-- Who acknowledged (account email or staff link) stays in this service-only table;
-- the public audit log records only the staff role.
ALTER TABLE veto_timeout_requests
 ADD COLUMN acknowledged_at timestamptz,
 ADD COLUMN acknowledged_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 ADD COLUMN acknowledged_link uuid REFERENCES match_links(id) ON DELETE SET NULL,
 ADD COLUMN acknowledged_role text CHECK(acknowledged_role IN ('admin','referee')),
 ADD COLUMN acknowledged_label text CHECK(length(acknowledged_label) BETWEEN 1 AND 320),
 ADD CONSTRAINT veto_timeout_acknowledgment CHECK((acknowledged_at IS NULL)=(acknowledged_role IS NULL) AND (acknowledged_at IS NULL)=(acknowledged_label IS NULL));

CREATE FUNCTION veto_acknowledge_timeout(p_match_id uuid,p_token uuid,p_request_id uuid,p_user uuid,p_label text)
RETURNS jsonb LANGUAGE plpgsql SET search_path=public AS $$
DECLARE s match_state%ROWTYPE; m matches%ROWTYPE; staff match_links%ROWTYPE; report veto_timeout_requests%ROWTYPE;
BEGIN
 SELECT * INTO staff FROM match_links WHERE match_id=p_match_id AND token=p_token AND link_type IN ('admin','referee') AND (expires_at IS NULL OR expires_at>now());
 IF NOT FOUND THEN RAISE EXCEPTION 'Head Admin or Referee link required'; END IF;
 IF p_label IS NULL OR length(trim(p_label)) NOT BETWEEN 1 AND 320 THEN RAISE EXCEPTION 'Staff name required'; END IF;
 SELECT * INTO s FROM match_state WHERE match_id=p_match_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Match state not found'; END IF;
 SELECT * INTO m FROM matches WHERE id=p_match_id;
 SELECT * INTO report FROM veto_timeout_requests WHERE id=p_request_id AND match_id=p_match_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Timeout request not found'; END IF;
 -- Retries and a second staff member see the first acknowledgment; no duplicate audit entry.
 IF report.acknowledged_at IS NULL THEN
  IF report.status='resolved' THEN RAISE EXCEPTION 'Timeout request already resolved'; END IF;
  UPDATE veto_timeout_requests SET acknowledged_at=now(),acknowledged_by=p_user,acknowledged_link=staff.id,acknowledged_role=staff.link_type,acknowledged_label=trim(p_label) WHERE id=report.id RETURNING * INTO report;
  INSERT INTO match_logs(match_id,step_number,action_type,actor,metadata)
  VALUES(p_match_id,s.current_step,'timeout_acknowledged','admin',jsonb_build_object('timeout_request_id',report.id,'request_actor',report.actor,'staff_role',staff.link_type,'confirmed_at',report.acknowledged_at));
 END IF;
 RETURN jsonb_build_object('new_state',to_jsonb(s),'match',to_jsonb(m),'request',to_jsonb(report)-'acknowledged_by'-'acknowledged_link');
END $$;
REVOKE ALL ON FUNCTION veto_acknowledge_timeout(uuid,uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION veto_acknowledge_timeout(uuid,uuid,uuid,uuid,text) TO service_role;

-- Acknowledgments also wake staff dashboards so other tabs stop reminding.
DROP TRIGGER veto_staff_timeout_notify ON veto_timeout_requests;
CREATE TRIGGER veto_staff_timeout_notify AFTER INSERT OR UPDATE OF status,acknowledged_at ON veto_timeout_requests FOR EACH ROW EXECUTE FUNCTION veto_notify_staff_timeout();
