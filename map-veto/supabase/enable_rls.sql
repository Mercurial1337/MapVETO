-- =============================================
-- Enable RLS on all flagged tables
-- Run this in Supabase SQL Editor
-- =============================================

-- 1. GAMES table
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Games are publicly readable"
  ON public.games FOR SELECT
  USING (true);

CREATE POLICY "Service role full access games"
  ON public.games FOR ALL
  USING (auth.role() = 'service_role');

-- 2. MAPS table
ALTER TABLE public.maps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Maps are publicly readable"
  ON public.maps FOR SELECT
  USING (true);

CREATE POLICY "Service role full access maps"
  ON public.maps FOR ALL
  USING (auth.role() = 'service_role');

-- 3. MAP_POOLS table
ALTER TABLE public.map_pools ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Map pools are publicly readable"
  ON public.map_pools FOR SELECT
  USING (true);

CREATE POLICY "Service role full access map_pools"
  ON public.map_pools FOR ALL
  USING (auth.role() = 'service_role');

-- 4. POOL_MAPS table
ALTER TABLE public.pool_maps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Pool maps are publicly readable"
  ON public.pool_maps FOR SELECT
  USING (true);

CREATE POLICY "Service role full access pool_maps"
  ON public.pool_maps FOR ALL
  USING (auth.role() = 'service_role');

-- 5. VETO_TEMPLATES table
ALTER TABLE public.veto_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Veto templates are publicly readable"
  ON public.veto_templates FOR SELECT
  USING (true);

CREATE POLICY "Service role full access veto_templates"
  ON public.veto_templates FOR ALL
  USING (auth.role() = 'service_role');

-- 6. TOURNAMENTS table
ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tournaments are publicly readable"
  ON public.tournaments FOR SELECT
  USING (true);

CREATE POLICY "Service role full access tournaments"
  ON public.tournaments FOR ALL
  USING (auth.role() = 'service_role');

-- 7. EVENTS table
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Events are publicly readable"
  ON public.events FOR SELECT
  USING (true);

CREATE POLICY "Service role full access events"
  ON public.events FOR ALL
  USING (auth.role() = 'service_role');
