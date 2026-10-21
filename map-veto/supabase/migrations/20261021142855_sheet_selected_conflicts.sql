-- Only selected conflicts may abort confirmation. Unchecked IDs owned by another
-- tab must never update that tab's history, approvals, passwords or matches.
DO $migration$
DECLARE definition text; old_checks text; new_checks text; old_loop text; new_loop text;
BEGIN
 definition:=replace(pg_get_functiondef('public.sheet_apply_day_without_schedule(uuid,uuid,text,bigint,text,jsonb,jsonb)'::regprocedure),chr(13),'');
 old_checks:=$old$ IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_rows) r WHERE r->>'source_id'<>'' GROUP BY r->>'source_id' HAVING count(*)>1) THEN RAISE EXCEPTION 'Duplicate Match ID'; END IF;
 IF EXISTS(SELECT 1 FROM sheet_match_sources s JOIN jsonb_array_elements(p_rows) r ON s.source_id=r->>'source_id' WHERE s.event_id=p_event AND s.spreadsheet_id=p_spreadsheet AND s.tab_id<>p_tab) THEN RAISE EXCEPTION 'Match ID is already used on another day tab'; END IF;$old$;
 new_checks:=$new$ IF p_choices IS NOT NULL THEN
  IF jsonb_typeof(p_choices)<>'array' THEN RAISE EXCEPTION 'Invalid selections'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_rows) r WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(p_choices) c WHERE c->>'source_id'=r->>'source_id') GROUP BY r->>'source_id' HAVING count(*)>1) THEN RAISE EXCEPTION 'A selected Match ID appears more than once in this day tab'; END IF;
  SELECT jsonb_build_object('conflicts',string_agg(format('%s (registered on %s)',s.source_id,s.tab_title),', ' ORDER BY s.source_id)) INTO choice
   FROM sheet_match_sources s WHERE s.event_id=p_event AND s.spreadsheet_id=p_spreadsheet AND s.tab_id<>p_tab
   AND EXISTS(SELECT 1 FROM jsonb_array_elements(p_choices) c WHERE c->>'source_id'=s.source_id);
  IF choice->>'conflicts' IS NOT NULL THEN RAISE EXCEPTION 'Selected Match ID conflicts: %. Uncheck these matches or give them unique IDs.',choice->>'conflicts'; END IF;
 END IF;$new$;
 old_loop:=$old$ FOR row IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
  IF COALESCE(row->>'source_id','')=''$old$;
 new_loop:=$new$ FOR row IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
  -- Ignore unrelated conflicts in both manual confirmation and background sync.
  -- The existing event lock serializes this with approvals on all other days.
  IF EXISTS(SELECT 1 FROM sheet_match_sources s WHERE s.event_id=p_event AND s.spreadsheet_id=p_spreadsheet AND s.source_id=row->>'source_id' AND s.tab_id<>p_tab)
   OR (SELECT count(*) FROM jsonb_array_elements(p_rows) r WHERE r->>'source_id'=row->>'source_id')>1 THEN CONTINUE; END IF;
  IF COALESCE(row->>'source_id','')=''$new$;
 old_checks:=replace(old_checks,chr(13),''); old_loop:=replace(old_loop,chr(13),'');
 new_checks:=replace(new_checks,chr(13),''); new_loop:=replace(new_loop,chr(13),'');
 IF strpos(definition,old_checks)=0 OR strpos(definition,old_loop)=0 THEN RAISE EXCEPTION 'Unexpected sheet importer definition; refusing to patch'; END IF;
 definition:=replace(replace(definition,old_checks,new_checks),old_loop,new_loop);
 EXECUTE definition;
END $migration$;
-- CREATE OR REPLACE preserves the existing service-only execution grants.
NOTIFY pgrst,'reload schema';
