import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
const db = new PGlite();
await db.exec(`CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;`);
let schema = readFileSync('supabase/schema.sql', 'utf8').split('-- Row Level Security')[0];
schema = schema.replace(/CREATE EXTENSION[^;]+;/g, '').replaceAll('uuid_generate_v4()', 'gen_random_uuid()');
await db.exec(schema);
await db.exec(readFileSync('supabase/migrations/011_ready_check.sql', 'utf8'));
await db.exec(`ALTER TABLE matches ADD COLUMN custom_veto_sequence jsonb; ALTER TABLE match_state ADD COLUMN is_paused boolean DEFAULT false; ALTER TABLE match_logs ADD COLUMN metadata jsonb; ALTER TABLE match_links DROP CONSTRAINT match_links_link_type_check;`);
for (const file of readdirSync('supabase/migrations').filter(f => /^0(1[6-9]|2[0-9])_/.test(f)).sort()) {
  await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'));
}
const steps = [
 {action:'ban',actor:'team_b'}, {action:'pick',actor:'team_a',map_number:1},
 {action:'side',actor:'team_b',map_number:1}, {action:'ban',actor:'team_a'},
 {action:'decider',actor:'system',map_number:2}, {action:'side',actor:'team_b',map_number:2}
];
const game = randomUUID(), template = randomUUID(), mapIds = Array.from({length:4}, () => randomUUID());
await db.query(`INSERT INTO games(id,name,slug) VALUES($1,'Test game','test')`,[game]);
await db.query(`INSERT INTO veto_templates(id,game_id,name,format,sequence) VALUES($1,$2,'Test','bo3',$3)`,[template,game,JSON.stringify({steps})]);
for (let i=0;i<4;i++) await db.query(`INSERT INTO maps(id,game_id,name,slug,image_url) VALUES($1,$2,$3,$3,'/test.webp')`,[mapIds[i],game,`Map${i}`]);
async function fixture(seeded=false) {
 const id=randomUUID(), a=randomUUID(), b=randomUUID(), admin=randomUUID(), observer=randomUUID();
 await db.query(`INSERT INTO matches(id,veto_template_id,team_a_name,team_b_name,format,status,coin_toss_forced,coin_toss_winner) VALUES($1,$2,'Alpha','Beta','bo3','ready_check',$3,$4)`,[id,template,seeded,seeded?'team_b':null]);
 await db.query(`INSERT INTO match_state(match_id,available_maps) VALUES($1,$2)`,[id,JSON.stringify(mapIds)]);
 for (const [role,token] of [['team_a',a],['team_b',b],['admin',admin],['observer',observer]]) await db.query(`INSERT INTO match_links(match_id,link_type,token) VALUES($1,$2,$3)`,[id,role,token]);
 return {id,a,b,admin,observer};
}
async function rpc(name,args) {
 const r=await db.query(`SELECT ${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) AS result`,args); return r.rows[0].result;
}
async function rejects(name,args,message) {await assert.rejects(()=>rpc(name,args),message);}
const f=await fixture();
await rejects('veto_ready',[f.id,f.observer],/team link/);
await rejects('veto_ready',[f.id,f.admin],/team link/);
const first=await rpc('veto_ready',[f.id,f.a]);
assert.equal(first.match.status,'ready_check'); assert.ok(first.new_state.team_a_ready_at);
const duplicate=await rpc('veto_ready',[f.id,f.a]); assert.equal(duplicate.new_state.team_a_ready_at,first.new_state.team_a_ready_at);
const both=await rpc('veto_ready',[f.id,f.b]); assert.equal(both.match.status,'coin_toss');
assert.equal((await db.query(`SELECT count(*)::int n FROM match_logs WHERE match_id=$1`,[f.id])).rows[0].n,2);
const seeded=await fixture(true); await rpc('veto_ready',[seeded.id,seeded.a]);
assert.equal((await rpc('veto_ready',[seeded.id,seeded.b])).match.status,'side_selection');
await db.query(`UPDATE match_links SET expires_at=now()-interval '1 second' WHERE token=$1`,[f.a]);
await rejects('veto_ready',[f.id,f.a],/team link/);
console.log('PASS check-in: gate, exact timestamps, duplicate requests, seeded path, spectator/admin/expired-link denial');
await db.close();
