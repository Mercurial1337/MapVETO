-- A veto is private until it is complete. Before completion only the match creator,
-- the event owner and event staff can read the match, its state and its audit log
-- directly; teams and observers read through the access-checked server routes.
-- Completed matches stay publicly readable for the public matches pages.
DROP POLICY IF EXISTS "Matches are publicly readable" ON matches;
DROP POLICY IF EXISTS "Match state is publicly readable" ON match_state;
DROP POLICY IF EXISTS "Match logs are publicly readable" ON match_logs;
CREATE POLICY "Completed or administered matches are readable" ON matches FOR SELECT USING (
 status='completed' OR ((SELECT auth.uid()) IS NOT NULL AND (
  created_by=(SELECT auth.uid())
  OR EXISTS(SELECT 1 FROM events e WHERE e.id=matches.event_id AND e.created_by=(SELECT auth.uid()))
  OR EXISTS(SELECT 1 FROM event_admins a WHERE a.event_id=matches.event_id AND a.user_id=(SELECT auth.uid()))
 ))
);
-- Evaluated with the reader's own access to matches.
CREATE POLICY "State of readable matches is readable" ON match_state FOR SELECT USING (EXISTS(SELECT 1 FROM matches m WHERE m.id=match_state.match_id));
CREATE POLICY "Logs of readable matches are readable" ON match_logs FOR SELECT USING (EXISTS(SELECT 1 FROM matches m WHERE m.id=match_logs.match_id));
