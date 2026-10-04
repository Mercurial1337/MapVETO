-- Only sessions checked in through the new engine opt into background timeouts.
ALTER TABLE match_state ADD COLUMN IF NOT EXISTS automation_enabled boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS veto_due_idx ON match_state(turn_started_at) WHERE automation_enabled AND NOT is_paused AND NOT is_complete;
CREATE OR REPLACE FUNCTION veto_expired_turns()
RETURNS integer LANGUAGE plpgsql SET search_path=public AS $$
DECLARE due record; link uuid; processed integer:=0;
BEGIN
 FOR due IN SELECT s.match_id,s.turn_started_at FROM match_state s JOIN matches m ON m.id=s.match_id
   WHERE s.automation_enabled AND NOT s.is_paused AND NOT s.is_complete
    AND m.status IN ('side_selection','in_progress') AND s.turn_started_at <= now()-interval '60 seconds'
   ORDER BY s.turn_started_at LIMIT 100 FOR UPDATE OF s SKIP LOCKED
 LOOP
  SELECT token INTO link FROM match_links WHERE match_id=due.match_id AND (expires_at IS NULL OR expires_at>now()) ORDER BY (link_type='admin') DESC LIMIT 1;
  IF link IS NOT NULL THEN
   BEGIN
    PERFORM veto_timeout(due.match_id,link,due.turn_started_at);processed:=processed+1;
   EXCEPTION WHEN OTHERS THEN
    UPDATE match_state SET is_paused=true,paused_remaining_seconds=0 WHERE match_id=due.match_id;
    INSERT INTO match_logs(match_id,step_number,action_type,actor,metadata)
     SELECT due.match_id,current_step,'admin_action','system',jsonb_build_object('action_details','Timeout failed; veto paused for referee review','error',SQLERRM) FROM match_state WHERE match_id=due.match_id;
   END;
  END IF;
 END LOOP;
 RETURN processed;
END $$;
REVOKE ALL ON FUNCTION veto_expired_turns() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION veto_expired_turns() TO service_role;
