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
// PGlite has no external scheduler/network extensions; validate their SQL callers
// with an inert scheduling boundary. Real worker delivery is covered by Sheets HTTP tests.
await db.exec(`CREATE SCHEMA cron; CREATE FUNCTION cron.schedule(text,text,text) RETURNS bigint LANGUAGE sql AS 'SELECT 1::bigint';`);
await db.exec(`CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT NULL::uuid'; CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS 'SELECT current_user::text';`);
let schema = readFileSync('supabase/schema.sql', 'utf8').split('-- Row Level Security')[0];
schema = schema.replace(/CREATE EXTENSION[^;]+;/g, '').replaceAll('uuid_generate_v4()', 'gen_random_uuid()');
await db.exec(schema);
for(const file of ['008_add_event_teams.sql','015_add_admin_link.sql']) {
 await db.exec(readFileSync(`supabase/migrations/${file}`,'utf8').replaceAll('uuid_generate_v4()','gen_random_uuid()'));
}
await db.exec('CREATE TRIGGER trigger_create_match_state_and_links AFTER INSERT ON matches FOR EACH ROW EXECUTE FUNCTION create_match_state_and_links();');
await db.exec(readFileSync('supabase/migrations/011_ready_check.sql', 'utf8'));
await db.exec(`ALTER TABLE matches ADD COLUMN custom_veto_sequence jsonb; ALTER TABLE match_state ADD COLUMN is_paused boolean DEFAULT false; ALTER TABLE match_logs ADD COLUMN metadata jsonb; ALTER TABLE match_links DROP CONSTRAINT match_links_link_type_check;`);
for (const file of readdirSync('supabase/migrations').filter(f => /^0(1[6-9]|[23][0-9])_/.test(f) && !f.includes('scheduler')).sort()) {
  await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8').replace(/CREATE EXTENSION[^;]+;/g,''));
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

await db.query('UPDATE match_links SET expires_at=NULL WHERE token=$1',[f.a]);
for(const token of [f.a,f.b,f.observer,randomUUID()]) {
 await rejects('veto_coin',[f.id,token,null],/Admin link/);
 await rejects('veto_coin',[f.id,token,'team_a'],/Admin link/);
}
await db.query("UPDATE match_links SET expires_at=now()-interval '1 second' WHERE token=$1",[f.admin]);
await rejects('veto_coin',[f.id,f.admin,null],/Admin link/);
await db.query('UPDATE match_links SET expires_at=NULL WHERE token=$1',[f.admin]);
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
const preceding=(await db.query("SELECT log_order FROM match_logs WHERE match_id=$1 AND action_type='ban' AND metadata->>'snapshot_id'=$2",[f.id,String(decider.metadata.snapshot_id)])).rows[0];assert.ok(Number(preceding.log_order)<Number(decider.log_order));
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
console.log('PASS Head Admin: authorization, reopen completed veto, unwind decider, preserve paused time, force/correct exact map and side, reset retains pool and history');

const background=await fixture(true);await rpc('veto_ready',[background.id,background.a]);await rpc('veto_ready',[background.id,background.b]);
await db.query("UPDATE match_state SET turn_started_at=now()-interval '61 seconds' WHERE match_id=$1",[background.id]);
const count=await rpc('veto_expired_turns',[]);assert.ok(count>=1);
assert.equal((await db.query('SELECT status FROM matches WHERE id=$1',[background.id])).rows[0].status,'in_progress');
console.log('PASS background timer: expired role choice advances with no connected browser');

const {BO1_STANDARD,BO3_STANDARD,BO5_GRAND_FINALS}=await import('../src/lib/veto/templates.ts');
const fullPool=[...mapIds];
for(let i=4;i<7;i++){const map=randomUUID();fullPool.push(map);await db.query("INSERT INTO maps(id,game_id,name,slug,image_url) VALUES($1,$2,$3,$3,'/test.webp')",[map,game,`Map${i}`]);}
for(const sequence of [BO1_STANDARD,BO3_STANDARD,BO5_GRAND_FINALS]) {
 const scenario=await fixture(true);
 await db.query('UPDATE matches SET custom_veto_sequence=$2 WHERE id=$1',[scenario.id,JSON.stringify(sequence)]);
 await db.query('UPDATE match_state SET available_maps=$2 WHERE match_id=$1',[scenario.id,JSON.stringify(fullPool)]);
 await rpc('veto_ready',[scenario.id,scenario.a]);await rpc('veto_ready',[scenario.id,scenario.b]);
 let position=await rpc('veto_position',[scenario.id,scenario.b,true,false,null]);let st=position.new_state;
 let previousClock=null;
 while(!st.is_complete) {
  const step=sequence.steps[st.current_step];
  if(previousClock && previousClock!==st.turn_started_at) await rejects('process_veto_action',[scenario.id,st.current_turn==='team_a'?scenario.a:scenario.b,step.action,step.action==='side'?null:st.available_maps[0],step.action==='side'?'attack':null,false,previousClock,null],/Turn changed/);
  previousClock=st.turn_started_at;
  // Exercise random timeout picks and sides as well as bans.
  await db.query("UPDATE match_state SET turn_started_at=now()-interval '61 seconds' WHERE match_id=$1",[scenario.id]);
  const turnClock=(await db.query('SELECT turn_started_at::text FROM match_state WHERE match_id=$1',[scenario.id])).rows[0].turn_started_at;
  st=(await rpc('veto_timeout',[scenario.id,scenario.observer,turnClock])).new_state;
 }
 assert.equal(st.results.length,sequence.format==='bo1'?1:sequence.format==='bo3'?3:5);
 assert.equal(new Set([...st.banned_maps.map(m=>m.map_id),...st.picked_maps.map(m=>m.map_id)]).size,7);
}
console.log('PASS formats: complete BO1/BO3/BO5 with swapped roles, random picks/bans/sides and deciders');
const incident=await fixture(),requestId=randomUUID();
const unchanged=(await db.query('SELECT to_jsonb(s) AS state FROM match_state s WHERE match_id=$1',[incident.id])).rows[0].state;
for(const token of [incident.observer,incident.admin,f.a]) await rejects('veto_request_timeout',[incident.id,token,'Connection problem',requestId],/team link/);
await rejects('veto_request_timeout',[incident.id,incident.a,'   ',requestId],/Describe/);
await rejects('veto_request_timeout',[incident.id,incident.a,'x'.repeat(1001),requestId],/Describe/);
await db.query("UPDATE match_links SET expires_at=now()-interval '1 second' WHERE token=$1",[incident.a]);
await rejects('veto_request_timeout',[incident.id,incident.a,'Connection problem',requestId],/team link/);
await db.query('UPDATE match_links SET expires_at=NULL WHERE token=$1',[incident.a]);
const requested=await rpc('veto_request_timeout',[incident.id,incident.a,'Connection problem',requestId]);
assert.deepEqual(requested.new_state,unchanged);assert.equal(requested.request.status,'open');
const retried=await rpc('veto_request_timeout',[incident.id,incident.a,'Connection problem',requestId]);assert.equal(retried.request.id,requestId);
await rejects('veto_request_timeout',[incident.id,incident.a,'Another issue',randomUUID()],/already has/);
await rejects('veto_request_timeout',[incident.id,incident.b,'Steal request ID',requestId],/already used/);
const otherReport=await rpc('veto_request_timeout',[incident.id,incident.b,'Game crashed',randomUUID()]);assert.equal(otherReport.request.actor,'team_b');
for(const token of [incident.a,incident.b,incident.observer,f.admin]) await rejects('veto_resolve_timeout',[incident.id,token,requestId,'Reconnected'],/Admin link/);
await rejects('veto_resolve_timeout',[incident.id,incident.admin,randomUUID(),'Reconnected'],/not found/);
await rejects('veto_resolve_timeout',[incident.id,incident.admin,requestId,' '],/Describe/);
await db.query('UPDATE match_state SET is_paused=true,paused_remaining_seconds=32 WHERE match_id=$1',[incident.id]);
const resolved=await rpc('veto_resolve_timeout',[incident.id,incident.admin,requestId,'Connection restored']);
assert.equal(resolved.request.status,'resolved');assert.ok(resolved.request.resolved_by);assert.equal(resolved.new_state.is_paused,true);assert.equal(resolved.new_state.paused_remaining_seconds,32);
await rpc('veto_resolve_timeout',[incident.id,incident.admin,requestId,'Connection restored']);
await rejects('veto_resolve_timeout',[incident.id,incident.admin,requestId,'Different resolution'],/already resolved/);
const audit=(await db.query("SELECT * FROM match_logs WHERE match_id=$1 AND metadata->>'timeout_request_id'=$2 ORDER BY log_order",[incident.id,requestId])).rows;
assert.deepEqual(audit.map(log=>log.action_type),['timeout_request','timeout_resolved']);assert.equal(audit[0].metadata.reason,'Connection problem');assert.equal(audit[1].metadata.resolution,'Connection restored');
await rpc('veto_request_timeout',[incident.id,incident.a,'New issue after resolution',randomUUID()]);
await db.query("UPDATE matches SET status='completed' WHERE id=$1",[incident.id]);
await rpc('veto_resolve_timeout',[incident.id,incident.admin,otherReport.request.id,'Game restarted']);
await rejects('veto_request_timeout',[incident.id,incident.b,'Too late',randomUUID()],/active veto/);
for(const role of ['anon','authenticated']) {
 assert.equal((await db.query("SELECT has_table_privilege($1,'veto_timeout_requests','SELECT') AS allowed",[role])).rows[0].allowed,false);
 assert.equal((await db.query("SELECT has_function_privilege($1,'veto_request_timeout(uuid,uuid,text,uuid)','EXECUTE') AS allowed",[role])).rows[0].allowed,false);
}
console.log('PASS team timeout requests: scoped permissions, explanations, retry protection, one open per team, referee resolution, unchanged clocks/pauses and complete audit');
const owner=randomUUID(),eventAdmin=randomUUID(),outsider=randomUUID(),event=randomUUID(),batch=randomUUID();
for(const id of [owner,eventAdmin,outsider])await db.query('INSERT INTO auth.users(id) VALUES($1)',[id]);
await db.query("INSERT INTO events(id,name,created_by) VALUES($1,'Codex bulk QA',$2)",[event,owner]);
await db.query('INSERT INTO event_admins(event_id,user_id) VALUES($1,$2)',[event,eventAdmin]);
const bulkRows=[{match_number:1,team_a_name:'Fnatic',team_b_name:'Sentinels',selection:'A'},{match_number:2,team_a_name:'Paper Rex',team_b_name:'LOUD',selection:'B'},{match_number:3,team_a_name:'G2',team_b_name:'Liquid',selection:'C'}];
const bulkArgs=[event,owner,batch,'matches.csv',template,JSON.stringify(bulkRows),mapIds];
await rejects('bulk_create_matches',[event,outsider,...bulkArgs.slice(2)],/administrator/);
const imported=await rpc('bulk_create_matches',bulkArgs);assert.equal(imported.match_count,3);
assert.deepEqual((await rpc('bulk_create_matches',bulkArgs)).match_ids,imported.match_ids);
await rejects('bulk_create_matches',[...bulkArgs.slice(0,3),'different.csv',...bulkArgs.slice(4)],/different data/);
assert.equal((await db.query('SELECT count(*)::int n FROM matches WHERE bulk_batch_id=$1',[batch])).rows[0].n,3);
assert.equal((await db.query('SELECT count(*)::int n FROM event_teams WHERE event_id=$1',[event])).rows[0].n,6);
for(const [index,id] of imported.match_ids.entries()) {
 const links=(await db.query('SELECT link_type,token FROM match_links WHERE match_id=$1',[id])).rows;assert.equal(links.length,5);
 const tokens=Object.fromEntries(links.map(link=>[link.link_type,link.token]));
 assert.equal((await rpc('veto_ready',[id,tokens.team_a])).match.status,'ready_check');
 const ready=await rpc('veto_ready',[id,tokens.team_b]);assert.equal(ready.match.status,'side_selection');
 const expected=index===0?'team_a':index===1?'team_b':ready.match.coin_toss_winner;
 assert.equal(ready.match.coin_toss_winner,expected);assert.ok(['team_a','team_b'].includes(expected));
 const again=await rpc('veto_ready',[id,tokens.team_a]);assert.equal(again.match.coin_toss_winner,expected);
 const tossLogs=(await db.query("SELECT metadata FROM match_logs WHERE match_id=$1 AND action_type='coin_toss'",[id])).rows;
 assert.equal(tossLogs.length,1);assert.equal(index===2?tossLogs[0].metadata.automatic_coin_toss:tossLogs[0].metadata.is_seeded,true);
 await rejects('veto_position',[id,tokens[expected==='team_a'?'team_b':'team_a'],true,false,null],/selected team/);
 assert.equal((await rpc('veto_position',[id,tokens[expected],false,false,null])).new_state.actor_mapping[expected],'team_b');
}
const badBatch=randomUUID();
await rejects('bulk_create_matches',[event,owner,badBatch,'bad.csv',template,JSON.stringify([...bulkRows,{...bulkRows[0],match_number:4,selection:'X'}]),mapIds],/Invalid match row/);
assert.equal((await db.query('SELECT count(*)::int n FROM match_import_batches WHERE id=$1',[badBatch])).rows[0].n,0);
assert.equal((await db.query('SELECT count(*)::int n FROM matches WHERE bulk_batch_id=$1',[badBatch])).rows[0].n,0);
const second=await rpc('bulk_create_matches',[event,eventAdmin,randomUUID(),'matches.csv',template,JSON.stringify(Array.from({length:25},(_,i)=>({...bulkRows[i%3],match_number:i+1}))),mapIds]);
assert.equal(second.match_count,25);assert.notEqual(second.batch_id,batch);
const page2=(await db.query('SELECT match_number FROM matches WHERE event_id=$1 AND bulk_batch_id=$2 ORDER BY match_number LIMIT 20 OFFSET 20',[event,second.batch_id])).rows;assert.deepEqual(page2.map(row=>row.match_number),[21,22,23,24,25]);
const privilege=(await db.query("SELECT has_function_privilege('authenticated','bulk_create_matches(uuid,uuid,uuid,text,uuid,jsonb,uuid[])','EXECUTE') allowed")).rows[0];assert.equal(privilege.allowed,false);
console.log('PASS bulk creation: event permissions, atomic rollback, five links and map pool, roster, A/B higher seed, automatic C toss once, idempotent retry, separate same-name batches and pagination');
const approval=await fixture(true);
const referee=(await db.query("SELECT token FROM match_links WHERE match_id=$1 AND link_type='referee'",[approval.id])).rows[0].token;
for(const op of ['pause','resume','restart','undo','correct','force','reset'])await rejects('veto_admin',[approval.id,referee,op,null,null,'Not allowed',null],/Admin link/);
await rejects('veto_coin',[approval.id,referee,null],/Admin link/);
await rpc('veto_ready',[approval.id,approval.a]);await rpc('veto_ready',[approval.id,approval.b]);await rpc('veto_position',[approval.id,approval.b,true,false,null]);
const before=(await db.query('SELECT * FROM match_state WHERE match_id=$1',[approval.id])).rows[0];
const resetId=randomUUID();
for(const token of [approval.a,approval.b,approval.admin,approval.observer,f.admin])await rejects('veto_request_reset',[approval.id,token,resetId,'Wrong team lineup'],/Referee link/);
await db.query("UPDATE match_links SET expires_at=now()-interval '1 second' WHERE token=$1",[referee]);await rejects('veto_request_reset',[approval.id,referee,resetId,'Wrong team lineup'],/Referee link/);await db.query('UPDATE match_links SET expires_at=NULL WHERE token=$1',[referee]);
await rpc('veto_request_reset',[approval.id,referee,resetId,'Wrong team lineup']);await rpc('veto_request_reset',[approval.id,referee,resetId,'Wrong team lineup']);
await rejects('veto_request_reset',[approval.id,referee,randomUUID(),'Another problem'],/already pending/);
for(const token of [referee,approval.admin,approval.observer,f.a])await rejects('veto_answer_reset',[approval.id,token,resetId,true],/team link/);
await rpc('veto_answer_reset',[approval.id,approval.a,resetId,true]);await rpc('veto_answer_reset',[approval.id,approval.a,resetId,true]);
const oneApproval=(await db.query('SELECT * FROM match_state WHERE match_id=$1',[approval.id])).rows[0];assert.equal(oneApproval.is_paused,before.is_paused);assert.equal(String(oneApproval.turn_started_at),String(before.turn_started_at));
assert.equal((await db.query('SELECT status FROM matches WHERE id=$1',[approval.id])).rows[0].status,'in_progress');
await rpc('veto_answer_reset',[approval.id,approval.b,resetId,true]);await rpc('veto_answer_reset',[approval.id,approval.b,resetId,true]);
const after=(await db.query('SELECT * FROM match_state WHERE match_id=$1',[approval.id])).rows[0];assert.equal(after.team_a_ready,false);assert.equal(after.team_b_ready,false);assert.equal(after.current_turn,null);assert.equal(after.is_paused,false);assert.equal(after.available_maps.length,4);assert.deepEqual(after.results,[]);
assert.equal((await db.query('SELECT status FROM matches WHERE id=$1',[approval.id])).rows[0].status,'ready_check');
const resetLogs=(await db.query('SELECT * FROM match_logs WHERE match_id=$1 ORDER BY log_order',[approval.id])).rows;
assert.equal(resetLogs.filter(log=>log.action_type==='reset_request').length,1);assert.equal(resetLogs.filter(log=>log.action_type==='reset_answer').length,2);assert.equal(resetLogs.filter(log=>log.metadata?.team_approved).length,1);
const declined=randomUUID();await rpc('veto_request_reset',[approval.id,referee,declined,'Decline scenario']);await rpc('veto_answer_reset',[approval.id,approval.a,declined,false]);
assert.equal((await rpc('veto_answer_reset',[approval.id,approval.b,declined,true])).status,'rejected');
const stale=randomUUID();await rpc('veto_request_reset',[approval.id,referee,stale,'Head Admin cancellation']);await rpc('veto_answer_reset',[approval.id,approval.a,stale,true]);await rpc('veto_admin',[approval.id,approval.admin,'reset',null,null,'Head Admin independent reset',null]);
assert.equal((await rpc('veto_answer_reset',[approval.id,approval.b,stale,true])).status,'cancelled');
await db.query("INSERT INTO event_admins(event_id,user_id,role) VALUES($1,$2,'referee')",[event,outsider]);await rejects('bulk_create_matches',[event,outsider,randomUUID(),'denied.csv',template,JSON.stringify(bulkRows),mapIds],/administrator/);
for(const fn of ['veto_request_reset(uuid,uuid,uuid,text)','veto_answer_reset(uuid,uuid,uuid,boolean)','veto_admin_internal(uuid,uuid,text,uuid,text,text,timestamptz)'])assert.equal((await db.query("SELECT has_function_privilege('authenticated',$1,'EXECUTE') allowed",[fn])).rows[0].allowed,false);
console.log('PASS staff/reset approval: referee overrides denied, scoped/expired access denied, one request and vote per team, first approval preserves clock, both reset once to check-in, decline, Head Admin cancellation and importer/RPC restrictions');
const rewind=await fixture(true);
await rpc('veto_ready',[rewind.id,rewind.a]);await rpc('veto_ready',[rewind.id,rewind.b]);
let rw=await rpc('veto_position',[rewind.id,rewind.b,true,false,null]);
async function finishRewind() {
 while(!rw.new_state.is_complete) {
  const step=steps[rw.new_state.current_step];
  rw=await rpc('veto_admin',[rewind.id,rewind.admin,'force',['ban','pick'].includes(step.action)?rw.new_state.available_maps[0]:null,step.action==='side'?'attack':null,'Rewind QA',rw.new_state.turn_started_at]);
 }
}
await finishRewind();
const rewindRef=(await db.query("SELECT token FROM match_links WHERE match_id=$1 AND link_type='referee'",[rewind.id])).rows[0].token;
const args=[rewind.id,rewind.admin,1,'Correct disputed pick',rw.new_state.turn_started_at,rw.new_state.current_step,randomUUID()];
for(const token of [rewindRef,rewind.a,rewind.b,rewind.observer,f.admin])await rejects('veto_reopen_step',[rewind.id,token,...args.slice(2)],/Head Admin/);
for(const step of [-1,6,7])await rejects('veto_reopen_step',[...args.slice(0,2),step,...args.slice(3)],/earlier completed/);
await rejects('veto_reopen_step',[...args.slice(0,2),4,...args.slice(3)],/decider is automatic/);
await rejects('veto_reopen_step',[...args.slice(0,3),' ',...args.slice(4)],/reason/);
await rejects('veto_reopen_step',[...args.slice(0,4),'2000-01-01T00:00:00Z',...args.slice(5)],/Veto changed/);
await rejects('veto_reopen_step',[...args.slice(0,5),5,args[6]],/Veto changed/);
await db.query("UPDATE match_links SET expires_at=now()-interval '1 second' WHERE token=$1",[rewind.admin]);
await rejects('veto_reopen_step',args,/Head Admin/);
await db.query('UPDATE match_links SET expires_at=NULL WHERE token=$1',[rewind.admin]);
const original=(await db.query("SELECT state FROM veto_snapshots WHERE match_id=$1 AND (state->>'current_step')::int=1 AND NOT undone",[rewind.id])).rows[0].state;
rw=await rpc('veto_reopen_step',args);
for(const key of ['available_maps','banned_maps','picked_maps','results','actor_mapping','current_turn'])assert.deepEqual(rw.new_state[key],original[key]);
assert.equal(rw.new_state.current_step,1);assert.equal(rw.new_state.is_complete,false);assert.equal(rw.match.status,'in_progress');assert.equal(rw.match.completed_at,null);
const rwLogs=(await db.query('SELECT * FROM match_logs WHERE match_id=$1 ORDER BY log_order',[rewind.id])).rows;
assert.equal(rwLogs.filter(log=>log.metadata?.superseded && log.metadata?.snapshot_id).length,5);
assert.equal(rwLogs.find(log=>log.action_type==='decider').metadata.superseded,true);
assert.equal(rwLogs.find(log=>log.action_type==='ban').metadata.superseded,undefined);
assert.equal(rwLogs.at(-1).metadata.target_step,1);assert.match(rwLogs.at(-1).metadata.action_details,/reopened step 2 from the completed veto: Correct disputed pick/);
const retry=await rpc('veto_reopen_step',args);assert.deepEqual(retry.new_state,rw.new_state);
assert.equal((await db.query("SELECT count(*)::int n FROM match_logs WHERE match_id=$1 AND metadata->>'request_id'=$2",[rewind.id,args[6]])).rows[0].n,1);
await rejects('veto_reopen_step',[...args.slice(0,3),'Changed reason',...args.slice(4)],/already used/);
await finishRewind();
rw=await rpc('veto_admin',[rewind.id,rewind.admin,'undo',null,null,'Return to last team step',rw.new_state.turn_started_at]);
rw=await rpc('veto_admin',[rewind.id,rewind.admin,'pause',null,null,'Preserve pause',rw.new_state.turn_started_at]);
rw=await rpc('veto_reopen_step',[rewind.id,rewind.admin,2,'Reopen side on replay',rw.new_state.turn_started_at,rw.new_state.current_step,randomUUID()]);
assert.equal(rw.new_state.current_step,2);assert.equal(rw.new_state.picked_maps.length,1);assert.equal(rw.new_state.banned_maps.length,1);assert.equal(rw.new_state.is_paused,true);assert.equal(rw.new_state.paused_remaining_seconds,60);
rw=await rpc('veto_reopen_step',[rewind.id,rewind.admin,0,'Reopen first ban',rw.new_state.turn_started_at,rw.new_state.current_step,randomUUID()]);
assert.deepEqual(rw.new_state.available_maps,mapIds);assert.deepEqual(rw.new_state.results,[]);
await rejects('veto_reopen_step',[rewind.id,rewind.admin,0,'No forward jumps',rw.new_state.turn_started_at,0,randomUUID()],/earlier completed/);
for(const role of ['anon','authenticated'])assert.equal((await db.query("SELECT has_function_privilege($1,'veto_reopen_step(uuid,uuid,integer,text,timestamptz,integer,uuid)','EXECUTE') allowed",[role])).rows[0].allowed,false);
console.log('PASS reopen step: Head Admin only, completed-veto restoration, exact maps/results/roles, side and first-step replay, superseded decider audit, stale state protection, idempotent retry and preserved pause');
for(const token of [rewind.a,rewind.b,rewind.admin,rewind.observer,rewindRef]) {
 const snapshot=await rpc('veto_session_snapshot',[rewind.id,token]);
 assert.equal(snapshot.state.current_step,rw.new_state.current_step);
 assert.equal(snapshot.match.status,rw.match.status);assert.equal(snapshot.logs.length,(await db.query('SELECT count(*)::int n FROM match_logs WHERE match_id=$1',[rewind.id])).rows[0].n);
 assert.ok(Number.isFinite(Number(snapshot.server_time)));
 assert.equal(JSON.stringify(snapshot).includes(rewind.admin),false);
}
assert.equal(await rpc('veto_session_snapshot',[rewind.id,f.admin]),null);
await db.query("UPDATE match_links SET expires_at=now()-interval '1 second' WHERE token=$1",[rewind.a]);
assert.equal(await rpc('veto_session_snapshot',[rewind.id,rewind.a]),null);
for(const role of ['anon','authenticated'])assert.equal((await db.query("SELECT has_function_privilege($1,'veto_session_snapshot(uuid,uuid)','EXECUTE') allowed",[role])).rows[0].allowed,false);
console.log('PASS atomic session: scoped/expired links, coherent match/state/logs, database clock, no tokens and service-only access');
await db.close();

