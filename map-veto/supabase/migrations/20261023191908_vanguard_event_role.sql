-- Keep existing role keys and magic links compatible; Head Ref is the admin label.
ALTER TABLE public.event_admins DROP CONSTRAINT event_admins_role_check;
ALTER TABLE public.event_admins ADD CONSTRAINT event_admins_role_check
 CHECK (role IN ('admin','referee','vanguard'));

-- These service-only RPCs independently enforce event match-management access.
-- Extend only their membership predicate, retaining all existing checks and grants.
DO $$
DECLARE item record; definition text; updated text;
BEGIN
 FOR item IN
  SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.prokind='f' AND p.proname IN (
   'bulk_create_matches','sheet_apply_day_without_schedule','sheet_link_existing',
   'sheet_replace_password','sheet_replace_team_passwords')
 LOOP
  definition:=pg_get_functiondef(item.oid);
  updated:=regexp_replace(definition,'role\s*=\s*''admin''','role IN (''admin'',''vanguard'')','g');
  IF updated=definition THEN RAISE EXCEPTION 'Expected event membership guard missing in %',item.oid::regprocedure; END IF;
  EXECUTE updated;
 END LOOP;
 SELECT pg_get_functiondef('public.veto_notify_staff_timeout()'::regprocedure) INTO definition;
 updated:=replace(definition,'a.role IN (''admin'',''referee'')','a.role IN (''admin'',''referee'',''vanguard'')');
 IF updated=definition THEN RAISE EXCEPTION 'Expected staff notification guard missing'; END IF;
 EXECUTE updated;
END $$;

-- Rename visible messages returned by current RPCs, without rewriting historical logs.
DO $$
DECLARE item record;
BEGIN
 FOR item IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.prokind='f' AND p.prosrc LIKE '%Head Admin%'
 LOOP
  EXECUTE replace(pg_get_functiondef(item.oid),'Head Admin','Head Ref');
 END LOOP;
END $$;
NOTIFY pgrst,'reload schema';
