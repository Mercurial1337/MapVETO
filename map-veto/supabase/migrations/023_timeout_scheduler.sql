CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule('map-veto-timeouts','5 seconds','SELECT public.veto_expired_turns()');
