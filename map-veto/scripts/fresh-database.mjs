import {readFileSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
/** Build only for an empty database. Reference data is imported separately. */
export function freshDatabaseSql() {
 const base=readFileSync(path.join(root,'supabase/schema.sql'),'utf8');
 // Never include the destructive reset header or historical reference seeds.
 const structure=base.slice(base.indexOf('-- Enable UUID extension'),base.indexOf('-- Seed Data: Valorant'));
 const migrations=readdirSync(path.join(root,'supabase/migrations'))
  .filter(name=>/^\d{3}_.*\.sql$/.test(name) && name!=='006_event_admins.sql').sort();
 return [
  `DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_tables WHERE schemaname='public') THEN RAISE EXCEPTION 'Fresh install requires an empty public schema'; END IF; END $$;`,
  'SET search_path=public,extensions;',structure,
  readFileSync(path.join(root,'supabase/migrations/add_custom_veto_sequence.sql'),'utf8'),
  ...migrations.map(name=>`-- Source: ${name}\n${readFileSync(path.join(root,'supabase/migrations',name),'utf8')}`),
  `ALTER PUBLICATION supabase_realtime ADD TABLE match_state,matches;`,
  // The new project has automatic Data API grants disabled. Service-only tables
  // stay private; browser reads get only the existing RLS-controlled surfaces.
  `GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
   ALTER FUNCTION update_match_state_timestamp() SET search_path=public;
   ALTER FUNCTION create_match_state_and_links() SET search_path=public;
   DO $$ BEGIN IF to_regprocedure('public.rls_auto_enable()') IS NOT NULL THEN
     REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC,anon,authenticated;
   END IF; END $$;
   ALTER TABLE event_teams ENABLE ROW LEVEL SECURITY;
   CREATE POLICY "Event team roster is readable" ON event_teams FOR SELECT TO anon,authenticated USING(true);
   GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
   GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
   GRANT SELECT ON games,maps,map_pools,pool_maps,veto_templates,tournaments,events,event_admins,event_teams,matches,match_state,match_logs TO anon,authenticated;
   NOTIFY pgrst,'reload schema';`,
 ].join('\n');
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url))process.stdout.write(freshDatabaseSql());
