-- Reopen an earlier team decision atomically, preserving the audit trail.
CREATE FUNCTION veto_reopen_step(p_match_id uuid,p_token uuid,p_step integer,p_reason text,p_expected timestamptz,p_current_step integer,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SET search_path=public AS $$
DECLARE s match_state%ROWTYPE; m matches%ROWTYPE; snap veto_snapshots%ROWTYPE; seq jsonb; admin_id uuid; prior jsonb; affected integer;
BEGIN
 SELECT id INTO admin_id FROM match_links WHERE match_id=p_match_id AND token=p_token AND link_type='admin' AND (expires_at IS NULL OR expires_at>now());
 IF admin_id IS NULL THEN RAISE EXCEPTION 'Head Admin link required'; END IF;
 IF length(trim(COALESCE(p_reason,''))) NOT BETWEEN 1 AND 500 OR p_request_id IS NULL THEN RAISE EXCEPTION 'A reason and request ID are required'; END IF;
 SELECT * INTO s FROM match_state WHERE match_id=p_match_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Match state not found'; END IF;
 SELECT * INTO m FROM matches WHERE id=p_match_id;
 SELECT metadata INTO prior FROM match_logs WHERE match_id=p_match_id AND action_type='admin_action' AND metadata->>'request_id'=p_request_id::text LIMIT 1;
 IF FOUND THEN
  IF prior->>'operation'<>'reopen_step' OR (prior->>'target_step')::int IS DISTINCT FROM p_step OR prior->>'reason' IS DISTINCT FROM trim(p_reason) OR prior->>'admin_link_id' IS DISTINCT FROM admin_id::text THEN RAISE EXCEPTION 'Request ID already used'; END IF;
  RETURN jsonb_build_object('new_state',to_jsonb(s),'match',to_jsonb(m));
 END IF;
 IF p_expected IS NULL OR p_expected IS DISTINCT FROM s.turn_started_at OR p_current_step IS DISTINCT FROM s.current_step THEN RAISE EXCEPTION 'Veto changed; refresh before reopening a step'; END IF;
 IF m.status NOT IN ('in_progress','completed') THEN RAISE EXCEPTION 'Veto must have started before reopening a step'; END IF;
 SELECT COALESCE(m.custom_veto_sequence,vt.sequence) INTO seq FROM veto_templates vt WHERE id=m.veto_template_id;
 IF p_step IS NULL OR p_step<0 OR p_step>=s.current_step OR p_step>=jsonb_array_length(seq->'steps') THEN RAISE EXCEPTION 'Choose an earlier completed step'; END IF;
 IF seq->'steps'->p_step->>'action' NOT IN ('ban','pick','side') THEN RAISE EXCEPTION 'The decider is automatic; reopen the preceding team selection'; END IF;
 SELECT * INTO snap FROM veto_snapshots WHERE match_id=p_match_id AND NOT undone AND (state->>'current_step')::int=p_step ORDER BY id DESC LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'No selection history available for this step'; END IF;
 -- A snapshot also owns any automatically derived decider log.
 UPDATE match_logs SET metadata=COALESCE(metadata,'{}') || jsonb_build_object('superseded',true,'superseded_by_request',p_request_id)
 WHERE match_id=p_match_id AND metadata->>'snapshot_id' IN (SELECT id::text FROM veto_snapshots WHERE match_id=p_match_id AND NOT undone AND id>=snap.id);
 UPDATE veto_snapshots SET undone=true WHERE match_id=p_match_id AND NOT undone AND id>=snap.id;
 GET DIAGNOSTICS affected=ROW_COUNT;
 UPDATE match_state SET current_step=p_step,current_turn=snap.state->>'current_turn',available_maps=snap.state->'available_maps',banned_maps=snap.state->'banned_maps',picked_maps=snap.state->'picked_maps',results=snap.state->'results',actor_mapping=snap.state->'actor_mapping',is_complete=false,turn_started_at=now(),paused_remaining_seconds=CASE WHEN s.is_paused THEN 60 ELSE NULL END WHERE match_id=p_match_id;
 UPDATE matches SET status='in_progress',completed_at=NULL WHERE id=p_match_id;
 INSERT INTO match_logs(match_id,step_number,action_type,actor,metadata) VALUES(p_match_id,p_step,'admin_action','admin',jsonb_build_object('operation','reopen_step','target_step',p_step,'from_step',s.current_step,'reason',trim(p_reason),'removed_selections',affected,'admin_link_id',admin_id,'request_id',p_request_id,'confirmed_at',now(),'action_details',format('reopened step %s from %s: %s',p_step+1,CASE WHEN s.is_complete THEN 'the completed veto' ELSE format('step %s',s.current_step+1) END,trim(p_reason))));
 SELECT * INTO s FROM match_state WHERE match_id=p_match_id;
 SELECT * INTO m FROM matches WHERE id=p_match_id;
 RETURN jsonb_build_object('new_state',to_jsonb(s),'match',to_jsonb(m));
END $$;
REVOKE ALL ON FUNCTION veto_reopen_step(uuid,uuid,integer,text,timestamptz,integer,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION veto_reopen_step(uuid,uuid,integer,text,timestamptz,integer,uuid) TO service_role;
