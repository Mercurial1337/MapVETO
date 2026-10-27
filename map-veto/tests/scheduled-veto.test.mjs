import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {freshDatabaseSql} from '../scripts/fresh-database.mjs';
import {parseVetoTime,vetoTimeInput} from '../src/lib/sheets/parse.ts';
import {parseDay} from '../src/lib/sheets/parse.ts';
const at=parseVetoTime('2026-10-24 18:00');assert.equal(at.scheduled_at,'2026-10-24T15:00:00.000Z');assert.equal(vetoTimeInput(at.scheduled_at),'2026-10-24T18:00');
for(const bad of ['18:00','24/10/2026 18:00','2026-02-30 12:00','2026-10-24 24:00','2026-10-24 18:00Z'])assert.ok(parseVetoTime(bad).schedule_error,bad);
assert.equal(parseVetoTime('').scheduled_at,null);
const rows=[['Round','Status','Names','MapVETO Match ID','Format','MapVETO Time'],['R1','','Alpha','T1','BO3','2026-10-24 18:00'],['','','Beta','','','']];
assert.equal(parseDay(rows)[0].scheduled_at,at.scheduled_at);rows[2][5]='2026-10-24 19:00';assert.match(parseDay(rows)[0].schedule_error,/different/);
const db=new PGlite();
const rpc=async(name,args=[])=> (await db.query(`SELECT ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args)).rows[0].result;
try{
 await db.exec(`CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT NULL::uuid'; CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS 'SELECT current_user::text'; CREATE SCHEMA cron; CREATE FUNCTION cron.schedule(text,text,text) RETURNS bigint LANGUAGE sql AS 'SELECT 1::bigint'; CREATE SCHEMA extensions; CREATE PUBLICATION supabase_realtime;`);
 await db.exec(freshDatabaseSql().replace(/CREATE EXTENSION[^;]+;/g,'').replaceAll('uuid_generate_v4()','gen_random_uuid()'));
 const game=randomUUID(),template=randomUUID(),ids=[];
 await db.query(`INSERT INTO games(id,name,slug) VALUES($1::uuid,'Test',$1::text)`,[game]);
 const steps=[['ban','team_a'],['ban','team_b'],['pick','team_a',1],['side','team_b',1],['pick','team_b',2],['side','team_a',2],['ban','team_a'],['ban','team_b'],['decider','system',3],['side','team_a',3]].map(([action,actor,map_number],i)=>({step:i+1,action,actor,map_number}));
 await db.query(`INSERT INTO veto_templates(id,game_id,name,format,sequence) VALUES($1,$2,'Test','bo3',$3)`,[template,game,JSON.stringify({steps})]);
 for(const name of ['Sunset','Summit','Lotus','Haven','Corrode','Bind','Abyss']){const id=randomUUID();ids.push(id);await db.query(`INSERT INTO maps(id,game_id,name,slug,image_url) VALUES($1,$2,$3,$3,'/test')`,[id,game,name]);}
 async function fixture(format='bo3',offset='-11 minutes'){
  const id=randomUUID();await db.query(`INSERT INTO matches(id,veto_template_id,team_a_name,team_b_name,format,status,veto_scheduled_at,veto_schedule_enforced,auto_coin_toss,coin_toss_forced,coin_toss_winner) VALUES($1,$2,'Alpha','Beta',$3,'ready_check',now()+$4::interval,true,true,true,'team_a')`,[id,template,format,offset]);
  await db.query(`UPDATE match_state SET available_maps=$2 WHERE match_id=$1`,[id,JSON.stringify(ids)]);
  const links=Object.fromEntries((await db.query('SELECT link_type,token FROM match_links WHERE match_id=$1',[id])).rows.map(r=>[r.link_type,r.token]));return {id,...links};
 }
 const future=await fixture('bo3','1 hour');await assert.rejects(()=>rpc('veto_ready',[future.id,future.team_a]),/not opened/);
 await rpc('veto_admin',[future.id,future.admin,'reset',null,null,'Restart without schedule',null]);await rpc('veto_ready',[future.id,future.team_a]);
 assert.equal((await db.query('SELECT veto_schedule_enforced FROM matches WHERE id=$1',[future.id])).rows[0].veto_schedule_enforced,false);
 for(const [format,n] of [['bo1',1],['bo3',3],['bo5',5]]){
  const f=await fixture(format);assert.equal(await rpc('veto_apply_schedule',[f.id]),true);assert.equal(await rpc('veto_apply_schedule',[f.id]),false);
  const state=(await db.query('SELECT * FROM match_state WHERE match_id=$1',[f.id])).rows[0];assert.equal(state.is_complete,true);assert.equal(state.results.length,n);
  const names=[];for(const pick of state.results){assert.ok(['attack','defense'].includes(pick.side));names.push((await db.query('SELECT name FROM maps WHERE id=$1',[pick.map_id])).rows[0].name);}
  assert.deepEqual(names,['Abyss','Bind','Corrode','Haven','Lotus'].slice(0,n));
  await rpc('veto_admin',[f.id,f.admin,'reset',null,null,'Retry normally',null]);assert.equal(await rpc('veto_apply_schedule',[f.id]),false);await rpc('veto_ready',[f.id,f.team_a]);await rpc('veto_ready',[f.id,f.team_b]);
  assert.equal((await db.query('SELECT veto_no_show_teams FROM matches WHERE id=$1',[f.id])).rows[0].veto_no_show_teams.length,0);
 }
 const f=await fixture();await db.query(`UPDATE match_state SET team_a_ready=true,team_a_ready_at=now()-interval '2 minutes' WHERE match_id=$1`,[f.id]);
 await rpc('veto_apply_schedule',[f.id]);await assert.rejects(()=>rpc('veto_ready',[f.id,f.team_b]),/deadline missed/);
 await rpc('veto_position',[f.id,f.team_a,true,false,null]);
 let selections=0;
 while(true){const s=(await db.query('SELECT * FROM match_state WHERE match_id=$1',[f.id])).rows[0];if(s.is_complete)break;assert.equal(s.current_turn,'team_a','absent turns execute immediately');const step=steps[s.current_step];
  await assert.rejects(()=>rpc('process_veto_action',[f.id,f.team_b,step.action,s.available_maps[0]||null,'attack',false,s.turn_started_at,null]),/No-show/);
  await rpc('process_veto_action',[f.id,f.team_a,step.action,step.action==='side'?null:s.available_maps[0],step.action==='side'?'attack':null,false,s.turn_started_at,null]);assert.ok(++selections<15);
 }
 assert.ok((await db.query(`SELECT count(*)::int n FROM match_logs WHERE match_id=$1 AND metadata->>'scheduled_no_show'='true'`,[f.id])).rows[0].n>1);
 const absentWinner=await fixture();await db.query(`UPDATE match_state SET team_b_ready=true WHERE match_id=$1`,[absentWinner.id]);await rpc('veto_apply_schedule',[absentWinner.id]);assert.equal((await db.query('SELECT status FROM matches WHERE id=$1',[absentWinner.id])).rows[0].status,'in_progress');
 for(const name of ['veto_apply_schedule(uuid)','veto_no_show_moves(uuid)','veto_ready(uuid,uuid)','sheet_apply_day(uuid,uuid,text,bigint,text,jsonb,jsonb)'])assert.equal((await db.query('SELECT has_function_privilege($1,$2,$3) allowed',['anon',name,'EXECUTE'])).rows[0].allowed,false);
 const owner=randomUUID(),event=randomUUID(),sheet='schedule_test_workbook_123456';
 await db.query('INSERT INTO auth.users(id) VALUES($1)',[owner]);await db.query(`INSERT INTO events(id,name,created_by,google_sheet_id) VALUES($1,'Schedule QA',$2,$3)`,[event,owner,sheet]);
 // Vanguard shares match-management RPC authority; Referees still cannot import.
 const vanguard=randomUUID(),referee=randomUUID();
 for(const [user,role] of [[vanguard,'vanguard'],[referee,'referee']]){
  await db.query('INSERT INTO auth.users(id) VALUES($1)',[user]);
  await db.query('INSERT INTO event_admins(event_id,user_id,role,added_by) VALUES($1,$2,$3,$4)',[event,user,role,owner]);
 }
 const importAs=user=>rpc('sheet_apply_day',[event,user,sheet,8,'D8 - Matches','[]','[]']);
 assert.equal((await importAs(vanguard)).created,0);
 await assert.rejects(()=>importAs(referee),/Head Ref access required/);
 for(const name of ['bulk_create_matches','sheet_apply_day_without_schedule','sheet_link_existing','sheet_replace_password','sheet_replace_team_passwords']){
  const definitions=(await db.query("SELECT prosrc FROM pg_proc WHERE proname=$1 AND pronamespace='public'::regnamespace",[name])).rows;
  assert.equal(definitions.length,1);assert.match(definitions[0].prosrc,/role IN \('admin','vanguard'\)/);
 }
 assert.match((await db.query("SELECT prosrc FROM pg_proc WHERE proname='veto_notify_staff_timeout'")).rows[0].prosrc,/a.role IN \('admin','referee','vanguard'\)/);
 console.log('PASS Vanguard database permissions: membership accepted, imports allowed, referee imports denied, all restricted import RPCs and staff timeout notifications include Vanguard');
 const row={source_id:'S1',round:'R1',team_a:'Schedule Alpha',team_b:'Schedule Beta',format:'bo3',status:'ready',issue:'',maps:ids,scheduled_at:'2099-10-24T15:00:00.000Z',schedule_error:null};
 const apply=(rows,choices)=>rpc('sheet_apply_day',[event,owner,sheet,1,'D1',JSON.stringify(rows),choices===null?null:JSON.stringify(choices)]);
 assert.equal((await apply([row],[{source_id:'S1',selection:'C',scheduled_at:'2099-10-24T16:00:00.000Z'}])).created,1);
 const imported=(await db.query(`SELECT m.* FROM matches m WHERE m.event_id=$1`,[event])).rows[0];assert.equal(imported.veto_scheduled_at.toISOString(),'2099-10-24T16:00:00.000Z');
 const admin=(await db.query(`SELECT token FROM match_links WHERE match_id=$1 AND link_type='admin'`,[imported.id])).rows[0].token;
 await rpc('veto_admin',[imported.id,admin,'reset',null,null,'Disable schedule',null]);await apply([row],null);assert.equal((await db.query('SELECT veto_schedule_enforced FROM matches WHERE id=$1',[imported.id])).rows[0].veto_schedule_enforced,false);
 // Deletion remains a tombstone until an explicit, authorized recreation.
 const sourceForRecreation=(await db.query('SELECT * FROM sheet_match_sources WHERE event_id=$1 AND source_id=$2',[event,'S1'])).rows[0];
 const oldTokens=(await db.query('SELECT token FROM match_links WHERE match_id=$1',[imported.id])).rows.map(link=>link.token);
 await db.query('DELETE FROM matches WHERE id=$1',[imported.id]);
 assert.equal((await apply([row],null)).created,0);
 assert.equal((await db.query('SELECT status FROM sheet_match_sources WHERE id=$1',[sourceForRecreation.id])).rows[0].status,'deleted');
 const requestId=randomUUID(),recreate=(user,request=requestId,data=row)=>rpc('sheet_recreate_match',[event,user,sheet,1,sourceForRecreation.id,request,JSON.stringify(data)]);
 await assert.rejects(()=>recreate(referee),/Head Ref access required/);
 await assert.rejects(()=>recreate(owner,randomUUID(),{...row,status:'waiting'}),/resolve this match/);
 await assert.rejects(()=>recreate(owner,randomUUID(),{...row,password_status:'supplied',password_hash:'scrypt$x'}),/Both team passwords/);
 const configBefore=(await db.query('SELECT active_tabs FROM event_sheet_connections WHERE event_id=$1',[event])).rows[0];
 const recreated=await recreate(vanguard);assert.equal(recreated.created,1);assert.notEqual(recreated.match_id,imported.id);
 assert.equal((await recreate(vanguard)).created,0);
 await assert.rejects(()=>recreate(owner,randomUUID()),/Only a deleted/);
 assert.deepEqual((await db.query('SELECT active_tabs FROM event_sheet_connections WHERE event_id=$1',[event])).rows[0],configBefore);
 assert.equal((await db.query('SELECT count(*)::int n FROM match_links WHERE match_id=$1',[recreated.match_id])).rows[0].n,5);
 assert.equal((await db.query('SELECT count(*)::int n FROM match_links WHERE token=ANY($1::uuid[])',[oldTokens])).rows[0].n,0);
 assert.equal((await apply([row],null)).created,0);
 for(const role of ['anon','authenticated'])assert.equal((await db.query("SELECT has_function_privilege($1,'sheet_recreate_match(uuid,uuid,text,bigint,uuid,uuid,jsonb)','EXECUTE') allowed",[role])).rows[0].allowed,false);
 console.log('PASS explicit sheet recreation: sync never recreates deleted matches, new ID and five new links, role/row/password validation, idempotent retries, existing-match denial, other day approvals unchanged and private RPC');
 const waiting={...row,source_id:'WAIT',team_a:'Waiting Alpha',team_b:'Winner #1',status:'waiting',scheduled_at:null,schedule_error:'Needs a full date'};
 await assert.rejects(()=>apply([row,waiting],[{source_id:'WAIT',selection:'A'}]),/MapVETO Time/);
 await apply([row,waiting],[{source_id:'WAIT',selection:'A',scheduled_at:'2099-10-24T17:00:00.000Z'}]);
 assert.equal((await apply([row,{...waiting,team_b:'Waiting Beta',status:'ready'}],null)).created,1);
 const waitMatch=(await db.query(`SELECT m.veto_scheduled_at FROM matches m WHERE m.event_id=$1 AND team_a_name='Waiting Alpha'`,[event])).rows[0];assert.equal(waitMatch.veto_scheduled_at.toISOString(),'2099-10-24T17:00:00.000Z');
 // A copied Day 1 ID must not block the only selected Day 2 match or mutate Day 1.
 const sourceBefore=(await db.query('SELECT * FROM sheet_match_sources WHERE event_id=$1 AND source_id=$2',[event,'S1'])).rows[0];
 const day2=(rows,choices)=>rpc('sheet_apply_day',[event,owner,sheet,2,'D2 - Matches',JSON.stringify(rows),choices===null?null:JSON.stringify(choices)]);
 const d2row=(id,extra={})=>({...row,source_id:id,team_a:id+' Alpha',team_b:id+' Beta',scheduled_at:null,...extra});
 const foreign={...row,team_a:'Wrong copied team',scheduled_at:'2099-11-01T15:00:00.000Z'};
 const day2Rows=[d2row('D2-M01'),foreign,d2row('D2-WAIT',{status:'waiting',team_b:'Winner #2'}),d2row('D2-UNCHECKED')];
 const confirmed=await day2(day2Rows,[{source_id:'D2-M01',selection:'C'},{source_id:'D2-WAIT',selection:'A'}]);
 assert.equal(confirmed.created,1);assert.equal(confirmed.waiting,1);
 assert.deepEqual(confirmed.results,[{source_id:'D2-M01',outcome:'created'},{source_id:'D2-WAIT',outcome:'waiting'}]);
 assert.deepEqual((await db.query('SELECT * FROM sheet_match_sources WHERE id=$1',[sourceBefore.id])).rows[0],sourceBefore);
 assert.equal((await db.query("SELECT count(*)::int n FROM sheet_match_sources WHERE event_id=$1 AND tab_id=2 AND source_id='S1'",[event])).rows[0].n,0);
 assert.equal((await day2(day2Rows,[{source_id:'D2-M01',selection:'C'},{source_id:'D2-WAIT',selection:'A'}])).created,0);
 const resolved=day2Rows.map(r=>r.source_id==='D2-WAIT'?{...r,status:'ready',team_b:'Resolved Beta'}:r);
 assert.equal((await day2(resolved,null)).created,1);assert.equal((await day2(resolved,null)).created,0);
 assert.equal((await db.query("SELECT count(*)::int n FROM matches WHERE event_id=$1 AND team_a_name='D2-UNCHECKED Alpha'",[event])).rows[0].n,0);
 await assert.rejects(()=>day2(day2Rows,[{source_id:'S1',selection:'C'}]),/Selected Match ID conflicts: S1 \(registered on D1\)/);
 const duplicates=[d2row('DUP'),d2row('DUP'),d2row('D2-VALID')];
 assert.equal((await day2(duplicates,[{source_id:'D2-VALID',selection:'C'}])).created,1);
 await assert.rejects(()=>day2(duplicates,[{source_id:'DUP',selection:'C'}]),/selected Match ID appears more than once/);
 // Even an excluded foreign source must be skipped without taking its ownership.
 await apply([row,waiting,d2row('D1-EXCLUDED')],[]);
 const excludedBefore=(await db.query("SELECT * FROM sheet_match_sources WHERE event_id=$1 AND source_id='D1-EXCLUDED'",[event])).rows[0];
 assert.equal((await day2([d2row('D1-EXCLUDED'),d2row('D2-LAST')],[{source_id:'D2-LAST',selection:'C'}])).created,1);
 assert.deepEqual((await db.query('SELECT * FROM sheet_match_sources WHERE id=$1',[excludedBefore.id])).rows[0],excludedBefore);
 for(const role of ['anon','authenticated'])assert.equal((await db.query("SELECT has_function_privilege($1,'sheet_apply_day_without_schedule(uuid,uuid,text,bigint,text,jsonb,jsonb)','EXECUTE') allowed",[role])).rows[0].allowed,false);
 const claim=async()=> (await db.query('SELECT * FROM sheet_claim_logos($1,$2,2)',[event,sheet])).rows;
 const firstClaim=await claim();assert.ok(firstClaim.length>0);assert.deepEqual(await claim(),[],'leases prevent duplicate logo exports');
 const sourceIds=firstClaim.map(item=>item.source_id);assert.ok(sourceIds.every(id=>id!==sourceBefore.id));
 await db.query('UPDATE sheet_match_sources SET logos_checked_at=now() WHERE id=$1',[sourceIds[0]]);
 await db.query("UPDATE sheet_match_sources SET logos_retry_after=now()-interval '1 second' WHERE event_id=$1 AND tab_id=2",[event]);
 assert.equal((await claim()).length,sourceIds.length-1,'finished images stay cached while expired leases retry');
 for(const role of ['anon','authenticated'])assert.equal((await db.query("SELECT has_function_privilege($1,'sheet_claim_logos(uuid,text,bigint)','EXECUTE') allowed",[role])).rows[0].allowed,false);
 console.log('PASS logo queue: only created matches from requested event/day, private RPC, exclusive leases, retry after lease expiry and completed imports never re-export');
 console.log('PASS selected sheet imports: unchecked cross-day and duplicate IDs do not block chosen matches, selected conflicts rejected with ID/day, foreign history unchanged, approved-only sync, repeat confirmation creates no duplicates, excluded foreign IDs never claimed and service-only grants preserved');
 console.log('PASS scheduled veto: strict GMT+3 parsing, future check-in blocked, BO1/3/5 alphabetical defaults, randomized sides, immediate no-show automation, late-team denial, absent winner, idempotency, reset, importer overrides, waiting sync persistence, no rearming and RPC privacy');
}finally{await db.close();}
