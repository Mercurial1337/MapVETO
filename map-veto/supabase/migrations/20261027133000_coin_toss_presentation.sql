-- Disabled until the two production GIFs and their exact duration are supplied.
CREATE TABLE public.coin_toss_presentation_settings (
 id boolean PRIMARY KEY DEFAULT true CHECK(id),
 duration_ms integer NOT NULL DEFAULT 0 CHECK(duration_ms=0 OR duration_ms BETWEEN 500 AND 10000)
);
INSERT INTO public.coin_toss_presentation_settings(id) VALUES(true);
ALTER TABLE public.coin_toss_presentation_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.coin_toss_presentation_settings FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.coin_toss_presentation_settings TO service_role;
ALTER TABLE public.matches ADD COLUMN coin_toss_reveal_at timestamptz;
ALTER TABLE public.matches ADD COLUMN coin_toss_animation_ms integer NOT NULL DEFAULT 0;

CREATE FUNCTION public.veto_coin_presentation() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE duration integer;
BEGIN
 IF NEW.status IN ('ready_check','cancelled') THEN
  NEW.coin_toss_reveal_at:=NULL; NEW.coin_toss_animation_ms:=0;
 ELSIF NEW.status='side_selection' AND OLD.status IS DISTINCT FROM NEW.status
  AND NOT NEW.coin_toss_forced AND NEW.coin_toss_winner IS NOT NULL
  AND COALESCE(cardinality(NEW.veto_no_show_teams),0)=0
  AND EXISTS(SELECT 1 FROM match_state WHERE match_id=NEW.id AND team_a_ready AND team_b_ready) THEN
  SELECT duration_ms INTO duration FROM coin_toss_presentation_settings WHERE id;
  IF duration>0 THEN
   NEW.coin_toss_animation_ms:=duration;
   -- A bounded loading allowance lets the GIF finish before the shared reveal.
   NEW.coin_toss_reveal_at:=clock_timestamp()+make_interval(secs=>(duration+2000)/1000.0);
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER coin_toss_presentation BEFORE UPDATE OF status ON public.matches FOR EACH ROW EXECUTE FUNCTION public.veto_coin_presentation();

CREATE FUNCTION public.veto_coin_choice_clock() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE reveal timestamptz;
BEGIN
 SELECT coin_toss_reveal_at INTO reveal FROM matches WHERE id=NEW.match_id AND status='side_selection';
 IF reveal>clock_timestamp() THEN NEW.turn_started_at:=greatest(NEW.turn_started_at,reveal); END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER coin_toss_choice_clock BEFORE UPDATE OF turn_started_at ON public.match_state FOR EACH ROW EXECUTE FUNCTION public.veto_coin_choice_clock();

-- Enforce the reveal barrier on the server as well as in the UI.
ALTER FUNCTION public.veto_position(uuid,uuid,boolean,boolean,timestamptz) RENAME TO veto_position_before_coin_reveal;
CREATE FUNCTION public.veto_position(p_match_id uuid,p_token uuid,p_first boolean,p_auto boolean DEFAULT false,p_expected timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 PERFORM 1 FROM match_state WHERE match_id=p_match_id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM matches WHERE id=p_match_id AND status='side_selection' AND coin_toss_reveal_at>clock_timestamp()) THEN RAISE EXCEPTION 'Coin toss reveal is still in progress'; END IF;
 RETURN veto_position_before_coin_reveal(p_match_id,p_token,p_first,p_auto,p_expected);
END $$;
REVOKE ALL ON FUNCTION public.veto_coin_presentation(),public.veto_coin_choice_clock(),public.veto_position(uuid,uuid,boolean,boolean,timestamptz),public.veto_position_before_coin_reveal(uuid,uuid,boolean,boolean,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.veto_coin_presentation(),public.veto_coin_choice_clock(),public.veto_position(uuid,uuid,boolean,boolean,timestamptz),public.veto_position_before_coin_reveal(uuid,uuid,boolean,boolean,timestamptz) TO service_role;
NOTIFY pgrst,'reload schema';
