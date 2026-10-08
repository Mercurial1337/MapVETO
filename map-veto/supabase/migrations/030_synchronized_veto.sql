-- One MVCC snapshot supplies both match data and the authoritative database clock.
CREATE FUNCTION veto_session_snapshot(p_match_id uuid,p_token uuid) RETURNS jsonb
LANGUAGE sql VOLATILE SET search_path=public AS $$
 SELECT jsonb_build_object(
  'match',to_jsonb(m)||jsonb_build_object('veto_templates',to_jsonb(v)),
  'state',to_jsonb(s),'userRole',l.link_type,
  'eventBranding',jsonb_build_object('logo_url',e.logo_url,'coin_image_url',e.coin_image_url,'custom_font_url',e.custom_font_url,'custom_font_name',e.custom_font_name),
  'logs',COALESCE((SELECT jsonb_agg(to_jsonb(log) ORDER BY log.log_order) FROM match_logs log WHERE log.match_id=m.id),'[]'::jsonb),
  'reset_request',(SELECT to_jsonb(r) FROM veto_reset_requests r WHERE r.match_id=m.id AND r.status='pending'),
  'server_time',extract(epoch FROM clock_timestamp())*1000)
 FROM matches m JOIN match_state s ON s.match_id=m.id JOIN veto_templates v ON v.id=m.veto_template_id
 JOIN match_links l ON l.match_id=m.id AND l.token=p_token AND (l.expires_at IS NULL OR l.expires_at>now())
 LEFT JOIN events e ON e.id=m.event_id WHERE m.id=p_match_id;
$$;
REVOKE ALL ON FUNCTION veto_session_snapshot(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION veto_session_snapshot(uuid,uuid) TO service_role;

-- Invalidate snapshots after any committed change, including pg_cron timeouts.
-- No match data, link tokens or incident reasons are sent on the public channel.
CREATE FUNCTION veto_notify_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE match_uuid uuid;
BEGIN
 match_uuid:=CASE WHEN TG_TABLE_NAME='matches' THEN NEW.id ELSE NEW.match_id END;
 IF to_regprocedure('realtime.send(jsonb,text,text,boolean)') IS NOT NULL THEN
  PERFORM realtime.send('{}'::jsonb,'veto_changed','match:'||match_uuid::text,false);
 END IF;
 RETURN NEW;
EXCEPTION WHEN OTHERS THEN
 RAISE WARNING 'Veto invalidation unavailable: %',SQLSTATE;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION veto_notify_change() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER veto_state_notify AFTER UPDATE ON match_state FOR EACH ROW EXECUTE FUNCTION veto_notify_change();
CREATE TRIGGER veto_match_notify AFTER UPDATE ON matches FOR EACH ROW EXECUTE FUNCTION veto_notify_change();
CREATE TRIGGER veto_log_notify AFTER INSERT ON match_logs FOR EACH ROW EXECUTE FUNCTION veto_notify_change();
