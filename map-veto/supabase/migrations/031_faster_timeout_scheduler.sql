SELECT cron.schedule('map-veto-timeouts','1 second','SELECT public.veto_expired_turns()');
