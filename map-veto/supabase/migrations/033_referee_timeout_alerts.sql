-- Referees receive the same timeout wakeups as Head Admins. Mutation permissions
-- remain unchanged; this trigger sends no incident details or link tokens.
CREATE OR REPLACE FUNCTION veto_notify_staff_timeout() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m matches%ROWTYPE; recipient uuid;
BEGIN
 SELECT * INTO m FROM matches WHERE id=NEW.match_id;
 IF to_regprocedure('realtime.send(jsonb,text,text,boolean)') IS NOT NULL THEN
  FOR recipient IN
   SELECT m.created_by WHERE m.created_by IS NOT NULL
   UNION SELECT e.created_by FROM events e WHERE e.id=m.event_id
   UNION SELECT a.user_id FROM event_admins a WHERE a.event_id=m.event_id AND a.role IN ('admin','referee')
  LOOP
   PERFORM realtime.send('{}'::jsonb,'timeouts_changed','staff-timeouts:'||recipient::text,false);
  END LOOP;
 END IF;
 RETURN NEW;
EXCEPTION WHEN OTHERS THEN
 RAISE WARNING 'Staff timeout invalidation unavailable: %',SQLSTATE;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION veto_notify_staff_timeout() FROM PUBLIC,anon,authenticated;
