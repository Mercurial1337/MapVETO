-- Service-only import history already has RLS and no browser grants.
ALTER TABLE public.sheet_match_sources
 ADD COLUMN logos_checked_at timestamptz,
 ADD COLUMN logos_retry_after timestamptz;
CREATE INDEX sheet_logos_pending ON public.sheet_match_sources(event_id,spreadsheet_id,tab_id)
 WHERE was_created AND match_id IS NOT NULL AND logos_checked_at IS NULL;
-- A short lease avoids duplicate exports from overlapping confirmations/workers.
CREATE FUNCTION public.sheet_claim_logos(p_event uuid,p_spreadsheet text,p_tab bigint)
RETURNS TABLE(source_id uuid,match_id uuid,row_number integer,team_a text,team_b text,logo_a text,logo_b text)
LANGUAGE sql SET search_path=public AS $$
 WITH candidates AS (
  SELECT s.id FROM sheet_match_sources s JOIN matches m ON m.id=s.match_id AND m.sheet_source_id=s.id
  JOIN event_sheet_connections c ON c.event_id=s.event_id AND c.spreadsheet_id=s.spreadsheet_id
  WHERE s.event_id=p_event AND s.spreadsheet_id=p_spreadsheet AND s.tab_id=p_tab AND s.was_created
   AND s.logos_checked_at IS NULL AND (s.logos_retry_after IS NULL OR s.logos_retry_after<=now())
   AND m.team_a_name=s.snapshot->>'team_a' AND m.team_b_name=s.snapshot->>'team_b'
  ORDER BY s.updated_at,s.id LIMIT 50 FOR UPDATE OF s SKIP LOCKED
 ), claimed AS (
  UPDATE sheet_match_sources s SET logos_retry_after=now()+interval '2 minutes'
  WHERE s.id IN(SELECT id FROM candidates) RETURNING s.*
 )
 SELECT s.id,s.match_id,(s.snapshot->>'row')::integer,m.team_a_name,m.team_b_name,m.team_a_logo,m.team_b_logo
 FROM claimed s JOIN matches m ON m.id=s.match_id;
$$;
REVOKE ALL ON FUNCTION public.sheet_claim_logos(uuid,text,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sheet_claim_logos(uuid,text,bigint) TO service_role;
-- Reuse the existing event asset bucket; fresh installations need it too.
DO $$ BEGIN
 IF to_regclass('storage.buckets') IS NOT NULL THEN
  INSERT INTO storage.buckets(id,name,public) VALUES('event-assets','event-assets',true) ON CONFLICT(id) DO NOTHING;
 END IF;
END $$;
NOTIFY pgrst,'reload schema';
