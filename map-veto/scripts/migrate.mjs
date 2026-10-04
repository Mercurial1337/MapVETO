import pg from 'pg';
import { readFileSync } from 'node:fs';
process.loadEnvFile('.env.local');
const client = new pg.Client({connectionString:process.env.SUPABASE_DB_URL,ssl:{rejectUnauthorized:true,ca:readFileSync("scripts/supabase-ca.crt","utf8")},connectionTimeoutMillis:15000});
try {
 await client.connect();
 if(process.argv.includes('--inspect')) {
  for(const sql of [
   `select column_name,data_type from information_schema.columns where table_name in ('match_state','matches') and table_schema='public'`,
   `select pg_get_functiondef(oid) definition from pg_proc where proname='process_veto_action'`,
   `select pg_get_triggerdef(oid) definition from pg_trigger where tgrelid='public.match_state'::regclass and not tgisinternal`
  ]) console.log(JSON.stringify((await client.query(sql)).rows));
 } else {
  await client.query('BEGIN');
  for(const file of process.argv.slice(2)) { await client.query(readFileSync(file,'utf8')); console.log('Applied '+file); }
  await client.query('COMMIT');
 }
} catch(e) { console.error('Database operation failed:', e.code || e.name, e.message.replaceAll(process.env.SUPABASE_DB_URL || '__none__','[redacted]')); process.exitCode=1; }
finally { await client.end(); }

