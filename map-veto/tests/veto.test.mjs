import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
const remote=process.argv.includes('--remote');
let db;
if(remote) {
 process.loadEnvFile('.env.local');
 const {default:pg}=await import('pg');
 db=new pg.Client({connectionString:process.env.SUPABASE_DB_URL,ssl:{rejectUnauthorized:true,ca:readFileSync('scripts/supabase-ca.crt','utf8')}});
 await db.connect(); await db.query('BEGIN');
 db.exec=(sql)=>db.query(sql);
 db.close=async()=>{await db.query('ROLLBACK'); await db.end();};
} else db=new PGlite();
if(!remote) {
await db.exec(`CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;`);
let schema = readFileSync('supabase/schema.sql', 'utf8').split('-- Row Level Security')[0];
schema = schema.replace(/CREATE EXTENSION[^;]+;/g, '').replaceAll('uuid_generate_v4()', 'gen_random_uuid()');
await db.exec(schema);
await db.exec(readFileSync('supabase/migrations/011_ready_check.sql', 'utf8'));
await db.exec(`ALTER TABLE matches ADD COLUMN custom_veto_sequence jsonb; ALTER TABLE match_state ADD COLUMN is_paused boolean DEFAULT false; ALTER TABLE match_logs ADD COLUMN metadata jsonb; ALTER TABLE match_links DROP CONSTRAINT match_links_link_type_check;`);
for (const file of readdirSync('supabase/migrations').filter(f => /^0(1[6-9]|2[0-9])_/.test(f)).sort()) {
  await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'));
}
}
const steps = [
 {action:'ban',actor:'team_b'}, {action:'pick',actor:'team_a',map_number:1},
 {action:'side',actor:'team_b',map_number:1}, {action:'ban',actor:'team_a'},
 {action:'decider',actor:'system',map_number:2}, {action:'side',actor:'team_b',map_number:2}
];
const game = randomUUID(), template = randomUUID(), mapIds = Array.from({length:4}, () => randomUUID());
await db.query(`INSERT INTO games(id,name,slug) VALUES($1,'Test game',$2)`,[game,randomUUID()]);
await db.query(`INSERT INTO veto_templates(id,game_id,name,format,sequence) VALUES($1,$2,'Test','bo3',$3)`,[template,game,JSON.stringify({steps})]);
for (let i=0;i<4;i++) await db.query(`INSERT INTO maps(id,game_id,name,slug,image_url) VALUES($1,$2,$3,$3,'/test.webp')`,[mapIds[i],game,`Map${i}`]);
async function fixture(seeded=false) {
 const id=randomUUID(), a=randomUUID(), b=randomUUID(), admin=randomUUID(), observer=randomUUID();
 await db.query(`INSERT INTO matches(id,veto_template_id,team_a_name,team_b_name,format,status,coin_toss_forced,coin_toss_winner) VALUES($1,$2,'Alpha','Beta','bo3','ready_check',$3,$4)`,[id,template,seeded,seeded?'team_b':null]);
 await db.query(`INSERT INTO match_state(match_id,available_maps) VALUES($1,$2) ON CONFLICT(match_id) DO UPDATE SET available_maps=EXCLUDED.available_maps`,[id,JSON.stringify(mapIds)]);
 for (const [role,token] of [['team_a',a],['team_b',b],['admin',admin],['observer',observer]]) await db.query(`INSERT INTO match_links(match_id,link_type,token) VALUES($1,$2,$3) ON CONFLICT(match_id,link_type) DO UPDATE SET token=EXCLUDED.token`,[id,role,token]);
 return {id,a,b,admin,observer};
}
async function rpc(name,args) {
 const r=await db.query(`SELECT ${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) AS result`,args); return r.rows[0].result;
}
async function rejects(name,args,message) {
 if(remote) await db.query('SAVEPOINT negative_test');
 try { await assert.rejects(()=>rpc(name,args),message); }
 finally { if(remote) await db.query('ROLLBACK TO SAVEPOINT negative_test'); }
}
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

await rejects('veto_coin',[f.id,f.observer,null],/link required/);
await rejects('veto_coin',[f.id,f.b,'team_a'],/Admin link/);
const coin=await rpc('veto_coin',[f.id,f.admin,'team_b']); assert.equal(coin.winner,'team_b');
await rejects('veto_coin',[f.id,f.admin,null],/not available/);
await rejects('veto_position',[f.id,f.a,true,false,null],/selected team/);
const pos=await rpc('veto_position',[f.id,f.b,true,false,null]);
assert.deepEqual(pos.new_state.actor_mapping,{team_b:'team_a',team_a:'team_b'});
assert.equal(pos.new_state.current_turn,'team_a'); // template starts with role B, not hardcoded A
assert.equal(pos.match.status,'in_progress');
await rejects('veto_position',[f.id,f.b,false,false,null],/not available/);
await rejects('veto_position',[seeded.id,seeded.observer,true,false,null],/selected team/);
await rejects('veto_position',[seeded.id,null,true,true,both.new_state.turn_started_at],/Timer/);
await db.query("UPDATE match_state SET turn_started_at=now()-interval '61 seconds' WHERE match_id=$1",[seeded.id]);
const expired=(await db.query('SELECT turn_started_at::text FROM match_state WHERE match_id=$1',[seeded.id])).rows[0].turn_started_at;
const auto=await rpc('veto_position',[seeded.id,null,false,true,expired]);
assert.equal(auto.new_state.actor_mapping.team_b,'team_b');
assert.equal((await db.query("SELECT metadata->>'timeout' timeout FROM match_logs WHERE match_id=$1 AND action_type='position_choice'",[seeded.id])).rows[0].timeout,'true');
console.log('PASS selection: coin/seed entitlement, swapped roles, custom first actor, duplicate requests, 60-second timeout and audit');

await rejects('process_veto_action',[f.id,f.admin,'ban',mapIds[0],null,false,null,null],/Observers/);
await db.query("UPDATE match_links SET expires_at=NULL WHERE token=$1",[f.a]);
await rejects('veto_timeout',[f.id,f.observer,pos.new_state.turn_started_at],/Timer/);
await db.query("UPDATE match_state SET is_paused=true,turn_started_at=now()-interval '61 seconds' WHERE match_id=$1",[f.id]);
await rejects('process_veto_action',[f.id,f.a,'ban',mapIds[0],null,false,null,null],/paused/);
await rejects('veto_timeout',[f.id,f.observer,pos.new_state.turn_started_at],/active timer/);
await db.query("UPDATE match_state SET is_paused=false WHERE match_id=$1",[f.id]);
const clock=(await db.query('SELECT turn_started_at::text FROM match_state WHERE match_id=$1',[f.id])).rows[0].turn_started_at;
const timeout=await rpc('veto_timeout',[f.id,f.observer,clock]);
assert.equal(timeout.new_state.current_step,1); assert.equal(timeout.new_state.banned_maps.length,1);
await rejects('veto_timeout',[f.id,f.observer,clock],/Timer/);
console.log('PASS timer: no early action, pause enforcement, random ban, stale timeout rejection');

const timedPosition=await fixture(true);await rpc('veto_ready',[timedPosition.id,timedPosition.a]);await rpc('veto_ready',[timedPosition.id,timedPosition.b]);
await db.query("UPDATE match_state SET turn_started_at=now()-interval '61 seconds' WHERE match_id=$1",[timedPosition.id]);
const positionClock=(await db.query('SELECT turn_started_at::text FROM match_state WHERE match_id=$1',[timedPosition.id])).rows[0].turn_started_at;
const assigned=await rpc('veto_timeout',[timedPosition.id,timedPosition.observer,positionClock]);assert.equal(assigned.match.status,'in_progress');
await rejects('veto_timeout',[timedPosition.id,timedPosition.observer,positionClock],/Timer/);
console.log('PASS Team A/B clock: observer-triggered random assignment, new turn clock, duplicate denial');

const picked=await rpc('process_veto_action',[f.id,f.b,'pick',timeout.new_state.available_maps[0],null,false,null,null]);
assert.equal(picked.current_step,2);
await rejects('process_veto_action',[f.id,f.a,'side',null,'invalid',false,null,null],/required/);
const side=await rpc('process_veto_action',[f.id,f.a,'side',null,'attack',false,null,null]);
assert.equal(side.picked_maps[0].side,'attack');
await rpc('process_veto_action',[f.id,f.b,'ban',side.available_maps[0],null,false,null,null]);
const decider=(await db.query("SELECT * FROM match_logs WHERE match_id=$1 AND action_type='decider'",[f.id])).rows[0];assert.ok(decider.map_id);assert.equal(decider.metadata.map_number,2);
const complete=await rpc('process_veto_action',[f.id,f.a,'side',null,'defense',false,null,null]);
assert.equal(complete.is_complete,true);assert.equal(complete.results.length,2);
const sideLogs=(await db.query("SELECT * FROM match_logs WHERE match_id=$1 AND action_type='side' ORDER BY log_order",[f.id])).rows;
assert.ok(sideLogs.every(log=>log.map_id && log.metadata.confirmed_at));
assert.equal(sideLogs[0].metadata.map_number,1);
const autoLog=(await db.query("SELECT * FROM match_logs WHERE match_id=$1 AND action_type='ban' ORDER BY log_order LIMIT 1",[f.id])).rows[0];assert.equal(autoLog.metadata.timeout,true);
console.log('PASS audit: pick/ban/side confirmation times, timeout source, decider, complete ordered results');

await rejects('veto_admin',[f.id,f.observer,'undo',null,null,'test',null],/Admin/);
await rejects('veto_admin',[f.id,f.a,'undo',null,null,'test',null],/Admin/);
await rejects('veto_admin',[f.id,f.admin,'undo',null,null,'',null],/reason/);
const reopened=await rpc('veto_admin',[f.id,f.admin,'undo',null,null,'Disputed side',null]);
assert.equal(reopened.match.status,'in_progress');assert.equal(reopened.new_state.current_step,5);assert.equal(reopened.new_state.picked_maps[1].side,null);
const corrected=await rpc('veto_admin',[f.id,f.admin,'force',null,'attack','Correct side',null]);assert.equal(corrected.new_state.is_complete,true);assert.equal(corrected.new_state.results[1].side,'attack');
await rpc('veto_admin',[f.id,f.admin,'undo',null,null,'Reopen side',null]);
const unwind=await rpc('veto_admin',[f.id,f.admin,'undo',null,null,'Reopen ban and decider',null]);assert.equal(unwind.new_state.current_step,3);assert.equal(unwind.new_state.picked_maps.length,1);assert.equal(unwind.new_state.available_maps.length,2);
await db.query("UPDATE match_state SET turn_started_at=now()-interval '15 seconds' WHERE match_id=$1",[f.id]);
const paused=await rpc('veto_admin',[f.id,f.admin,'pause',null,null,'Technical issue',null]);assert.equal(paused.new_state.is_paused,true);assert.ok(Math.abs(paused.new_state.paused_remaining_seconds-45)<1);
const resumed=await rpc('veto_admin',[f.id,f.admin,'resume',null,null,'Issue resolved',null]);assert.equal(resumed.new_state.is_paused,false);
await rpc('veto_admin',[f.id,f.admin,'restart',null,null,'Restart move',null]);
await rpc('veto_admin',[f.id,f.admin,'force',unwind.new_state.available_maps[0],null,'Force chosen ban',null]);
const correction=await rpc('veto_admin',[f.id,f.admin,'correct',unwind.new_state.available_maps[1],null,'Correct ban',null]);assert.equal(correction.new_state.banned_maps.at(-1).map_id,unwind.new_state.available_maps[1]);
const logCount=(await db.query('SELECT count(*)::int n FROM match_logs WHERE match_id=$1',[f.id])).rows[0].n;
const reset=await rpc('veto_admin',[f.id,f.admin,'reset',null,null,'Restart match',null]);assert.equal(reset.match.status,'ready_check');assert.equal(reset.new_state.available_maps.length,4);assert.equal(reset.new_state.is_paused,false);
assert.equal((await db.query('SELECT count(*)::int n FROM match_logs WHERE match_id=$1',[f.id])).rows[0].n,logCount+1);
assert.ok((await db.query("SELECT * FROM match_logs WHERE match_id=$1 AND metadata->>'superseded'='true'",[f.id])).rows.length>0);
console.log('PASS referee: authorization, reopen completed veto, unwind decider, preserve paused time, force/correct exact map and side, reset retains pool and history');
await db.close();

