-- Integration check against a configured database. All fixture writes roll back.
BEGIN;
DO $test$
DECLARE owner_id uuid; qa_event_id uuid:=gen_random_uuid(); sheet text:='qa_selected_sheet_1234567890';
 pool jsonb; base jsonb; foreign_row jsonb; selected_row jsonb; waiting_row jsonb; unchecked_row jsonb;
 rows jsonb; choices jsonb; result jsonb; before_source jsonb; before_excluded jsonb; rejected boolean:=false;
BEGIN
 SELECT created_by INTO owner_id FROM public.events ORDER BY created_at LIMIT 1;
 IF owner_id IS NULL THEN RAISE EXCEPTION 'Test requires an existing event owner'; END IF;
 SELECT jsonb_agg(id) INTO pool FROM (SELECT m.id FROM public.maps m JOIN public.veto_templates t ON t.game_id=m.game_id WHERE t.id=(SELECT id FROM public.veto_templates WHERE format='bo3' ORDER BY is_default DESC,created_at,id LIMIT 1) AND m.is_active ORDER BY m.name LIMIT 7) m;
 IF jsonb_array_length(pool)<>7 THEN RAISE EXCEPTION 'Test requires seven active maps'; END IF;
 INSERT INTO public.events(id,name,created_by,google_sheet_id) VALUES(qa_event_id,'Codex selected import rollback test',owner_id,sheet);
 base:=jsonb_build_object('round','QA','format','bo3','status','ready','issue','','password_status','not_used','maps',pool,'scheduled_at',NULL,'schedule_error',NULL);
 foreign_row:=base||jsonb_build_object('source_id','D1-M01','team_a','QA old Alpha','team_b','QA old Beta');
 PERFORM public.sheet_apply_day(qa_event_id,owner_id,sheet,1,'D1 - Matches',jsonb_build_array(foreign_row,base||jsonb_build_object('source_id','D1-EXCLUDED','team_a','QA excluded Alpha','team_b','QA excluded Beta')),'[{"source_id":"D1-M01","selection":"C"}]');
 SELECT to_jsonb(s) INTO before_source FROM public.sheet_match_sources s WHERE s.event_id=qa_event_id AND s.source_id='D1-M01';
 SELECT to_jsonb(s) INTO before_excluded FROM public.sheet_match_sources s WHERE s.event_id=qa_event_id AND s.source_id='D1-EXCLUDED';
 selected_row:=base||jsonb_build_object('source_id','D2-M01','team_a','QA new Alpha','team_b','QA new Beta');
 waiting_row:=base||jsonb_build_object('source_id','D2-WAIT','team_a','QA waiting Alpha','team_b','Winner #1','status','waiting');
 unchecked_row:=base||jsonb_build_object('source_id','D2-UNCHECKED','team_a','QA unchecked Alpha','team_b','QA unchecked Beta');
 rows:=jsonb_build_array(selected_row,foreign_row||jsonb_build_object('team_a','Changed copied Alpha'),waiting_row,unchecked_row,base||jsonb_build_object('source_id','D1-EXCLUDED','team_a','Changed excluded Alpha','team_b','Changed excluded Beta'));
 choices:='[{"source_id":"D2-M01","selection":"C"},{"source_id":"D2-WAIT","selection":"A"}]';
 result:=public.sheet_apply_day(qa_event_id,owner_id,sheet,2,'D2 - Matches',rows,choices);
 IF (result->>'created')::int<>1 OR (result->>'waiting')::int<>1 THEN RAISE EXCEPTION 'Selected import failed: %',result; END IF;
 IF (SELECT to_jsonb(s) FROM public.sheet_match_sources s WHERE s.event_id=qa_event_id AND s.source_id='D1-M01') IS DISTINCT FROM before_source THEN RAISE EXCEPTION 'Foreign created history changed'; END IF;
 IF (SELECT to_jsonb(s) FROM public.sheet_match_sources s WHERE s.event_id=qa_event_id AND s.source_id='D1-EXCLUDED') IS DISTINCT FROM before_excluded THEN RAISE EXCEPTION 'Foreign excluded history changed'; END IF;
 result:=public.sheet_apply_day(qa_event_id,owner_id,sheet,2,'D2 - Matches',rows,choices);
 IF (result->>'created')::int<>0 THEN RAISE EXCEPTION 'Retry created a duplicate'; END IF;
 rows:=jsonb_build_array(selected_row,foreign_row,waiting_row||jsonb_build_object('status','ready','team_b','QA resolved Beta'),unchecked_row);
 result:=public.sheet_apply_day(qa_event_id,owner_id,sheet,2,'D2 - Matches',rows,NULL);
 IF (result->>'created')::int<>1 THEN RAISE EXCEPTION 'Approved waiting match did not sync'; END IF;
 IF EXISTS(SELECT 1 FROM public.matches m WHERE m.event_id=qa_event_id AND m.team_a_name='QA unchecked Alpha') THEN RAISE EXCEPTION 'Unchecked match was created'; END IF;
 BEGIN
  PERFORM public.sheet_apply_day(qa_event_id,owner_id,sheet,2,'D2 - Matches',rows,'[{"source_id":"D1-M01","selection":"C"}]');
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE 'Selected Match ID conflicts: D1-M01 (registered on D1 - Matches)%' THEN RAISE; END IF;
  rejected:=true;
 END;
 IF NOT rejected THEN RAISE EXCEPTION 'Selected foreign ID was not rejected'; END IF;
 IF has_function_privilege('anon','public.sheet_apply_day_without_schedule(uuid,uuid,text,bigint,text,jsonb,jsonb)','EXECUTE') OR has_function_privilege('authenticated','public.sheet_apply_day_without_schedule(uuid,uuid,text,bigint,text,jsonb,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'Importer execution grants leaked'; END IF;
END $test$;
ROLLBACK;
SELECT 'PASS: selected creation, cross-day history preservation, idempotent retry, approved-only sync, selected conflict rejection and private RPC; fixtures rolled back' AS result;
