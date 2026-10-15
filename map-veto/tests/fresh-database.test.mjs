import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {freshDatabaseSql} from '../scripts/fresh-database.mjs';
const db=new PGlite();
try {
 await db.exec(`CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT NULL::uuid'; CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS 'SELECT current_user::text';
 CREATE SCHEMA cron; CREATE FUNCTION cron.schedule(text,text,text) RETURNS bigint LANGUAGE sql AS 'SELECT 1::bigint'; CREATE SCHEMA extensions;
 CREATE PUBLICATION supabase_realtime;`);
 // Only extension provisioning is replaced; SQL structure, policies, grants,
 // functions, triggers and the refusal to reset an existing DB run unchanged.
 const sql=freshDatabaseSql().replace(/CREATE EXTENSION[^;]+;/g,'').replaceAll('uuid_generate_v4()','gen_random_uuid()');
 assert.ok(!sql.includes('DROP TABLE'));
 await db.exec(sql);
 const {rows}=await db.query(`SELECT tablename,rowsecurity FROM pg_tables WHERE schemaname='public'`);
 assert.equal(rows.length,23);assert.ok(rows.every(row=>row.rowsecurity),JSON.stringify(rows.filter(row=>!row.rowsecurity)));
 for(const table of ['events','matches','match_links','match_logs','event_sheet_connections','games','maps','veto_templates'])assert.equal((await db.query(`SELECT count(*)::int n FROM ${table}`)).rows[0].n,0);
 for(const table of ['match_access_settings','sheet_worker_settings'])assert.equal((await db.query(`SELECT count(*)::int n FROM ${table}`)).rows[0].n,1);
 assert.ok((await db.query(`SELECT has_table_privilege('service_role','matches','INSERT') allowed`)).rows[0].allowed);
 assert.ok((await db.query(`SELECT has_table_privilege('anon','maps','SELECT') allowed`)).rows[0].allowed);
 assert.equal((await db.query(`SELECT has_table_privilege('anon','match_links','SELECT') allowed`)).rows[0].allowed,false);
 await assert.rejects(db.exec(sql),/requires an empty public schema/);
 console.log('PASS fresh database: full schema including timestamped team-password migration, 23 RLS-protected tables, no records/reference seeds, new secrets, explicit API grants, refuses existing database');
}finally{await db.close();}
