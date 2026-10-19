-- Run against VG Veto. Updates reference data only; existing match states stay intact.
DO $$
DECLARE
 game uuid;
 pool uuid;
 desired text[] := ARRAY['Abyss','Bind','Corrode','Haven','Lotus','Summit','Sunset'];
BEGIN
 SELECT id INTO STRICT game FROM games WHERE slug='valorant';
 SELECT id INTO STRICT pool FROM map_pools WHERE game_id=game AND is_default AND is_active;
 INSERT INTO maps(game_id,name,slug,image_url,is_active)
 VALUES(game,'Summit','summit','/maps/valorant/Summit.webp',true)
 ON CONFLICT(game_id,slug) DO UPDATE SET name=excluded.name,image_url=excluded.image_url,is_active=true;
 IF (SELECT count(*) FROM maps WHERE game_id=game AND is_active AND name=ANY(desired))<>7 THEN
  RAISE EXCEPTION 'Competitive pool requires all seven active maps';
 END IF;
 DELETE FROM pool_maps WHERE pool_id=pool;
 INSERT INTO pool_maps(pool_id,map_id,display_order)
 SELECT pool,m.id,d.position::int-1 FROM unnest(desired) WITH ORDINALITY AS d(name,position)
 JOIN maps m ON m.name=d.name AND m.game_id=game;
END $$;
