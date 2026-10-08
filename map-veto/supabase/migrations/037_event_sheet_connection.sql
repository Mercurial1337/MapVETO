-- Event creation/editing and match imports share the same saved workbook.
-- Existing import connections take precedence over the old export-only setting.
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS google_sheet_id varchar(100);
UPDATE public.events e SET google_sheet_id=c.spreadsheet_id
FROM public.event_sheet_connections c
WHERE c.event_id=e.id AND e.google_sheet_id IS DISTINCT FROM c.spreadsheet_id;

INSERT INTO public.event_sheet_connections(event_id,spreadsheet_id,connected_by)
SELECT id,trim(google_sheet_id),created_by FROM public.events
WHERE trim(google_sheet_id) ~ '^[A-Za-z0-9_-]{20,100}$' AND created_by IS NOT NULL
ON CONFLICT(event_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.connect_event_sheet()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE saved text;
BEGIN
 SELECT spreadsheet_id INTO saved FROM public.event_sheet_connections WHERE event_id=NEW.id;
 IF saved IS NOT NULL AND saved IS DISTINCT FROM NEW.google_sheet_id THEN
  RAISE EXCEPTION 'This event already has a sheet connected. Use a new event for another workbook; stop automatic sync on the Sheet matches page.' USING ERRCODE='23514';
 END IF;
 IF NEW.google_sheet_id IS NOT NULL AND NEW.created_by IS NOT NULL THEN
  IF NEW.google_sheet_id !~ '^[A-Za-z0-9_-]{20,100}$' THEN
   RAISE EXCEPTION 'Invalid Google spreadsheet ID' USING ERRCODE='23514';
  END IF;
  INSERT INTO public.event_sheet_connections(event_id,spreadsheet_id,connected_by)
  VALUES(NEW.id,NEW.google_sheet_id,NEW.created_by) ON CONFLICT(event_id) DO NOTHING;
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.connect_event_sheet() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER event_sheet_connection AFTER INSERT OR UPDATE OF google_sheet_id ON public.events
FOR EACH ROW EXECUTE FUNCTION public.connect_event_sheet();
