import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {createClient} from '@supabase/supabase-js';
import {createServerClient} from '@supabase/ssr';
process.loadEnvFile('.env.local');
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY),base=process.env.TEST_APP_URL||'http://127.0.0.1:3001';
const sheet='1tifK0_pUo4iLxJ1cGVECxONf5B-fw0_u4iI8G1gh8NA',keep=process.argv.includes('--keep'),userIds=[];let eventId;
async function cleanup(qa){await db.from('matches').delete().eq('event_id',qa.eventId);assert.ifError((await db.from('events').delete().eq('id',qa.eventId).like('name','Codex Sheets QA%')).error);for(const id of qa.userIds)assert.ifError((await db.auth.admin.deleteUser(id)).error);}
if(process.argv.includes('--cleanup')){await cleanup(JSON.parse(readFileSync('.qa-sheet-session.json','utf8')));unlinkSync('.qa-sheet-session.json');process.exit(0);}
async function account(){const email=`sheets-${randomUUID()}@example.invalid`,password=randomUUID()+'aA!';const {data,error}=await db.auth.admin.createUser({email,password,email_confirm:true});assert.ifError(error);userIds.push(data.user.id);const jar=new Map();const client=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:items=>items.forEach(({name,value})=>jar.set(name,value))}});assert.ifError((await client.auth.signInWithPassword({email,password})).error);return {id:data.user.id,email,password,cookie:[...jar].map(([name,value])=>`${name}=${value}`).join('; ')};}
async function api(owner,path='',body,expected=200){const response=await fetch(base+`/api/events/${eventId}/sheet`+path,{headers:{Cookie:owner?.cookie||'','Content-Type':'application/json'},...(body?{method:'POST',body:JSON.stringify(body)}:{})});const result=await response.json();assert.equal(response.status,expected,JSON.stringify(result));return result;}
try{
 const owner=await account(),referee=await account(),outsider=await account();
 const created=await fetch(base+'/api/events',{method:'POST',headers:{Cookie:owner.cookie,'Content-Type':'application/json'},body:JSON.stringify({name:'Codex Sheets QA '+randomUUID(),google_sheet_id:`https://docs.google.com/spreadsheets/d/${sheet}/edit?usp=sharing`})});
 const creation=await created.json();assert.equal(created.status,201,JSON.stringify(creation));eventId=creation.event.id;assert.equal(creation.event.google_sheet_id,sheet);
 const initial=await api(owner);assert.equal(initial.connection.spreadsheet_id,sheet);assert.equal(initial.tabs.length,7);assert.deepEqual(initial.connection.active_tabs,[]);
 assert.equal((await db.from('matches').select('id').eq('event_id',eventId)).data.length,0);
 const replacement=await fetch(base+`/api/events/${eventId}`,{method:'PUT',headers:{Cookie:owner.cookie,'Content-Type':'application/json'},body:JSON.stringify({google_sheet_id:'another_workbook_1234567890'})});assert.equal(replacement.status,409);
 const invalid=await fetch(base+'/api/events',{method:'POST',headers:{Cookie:owner.cookie,'Content-Type':'application/json'},body:JSON.stringify({name:'Codex Sheets QA invalid',google_sheet_id:'https://example.com/invalid'})});assert.equal(invalid.status,400);
 assert.ifError((await db.from('event_admins').insert({event_id:eventId,user_id:referee.id,role:'referee',added_by:owner.id})).error);
 if(keep)writeFileSync('.qa-sheet-session.json',JSON.stringify({eventId,userIds,owner,base,sheet}));
 await api(null,'',undefined,401);await api(outsider,'',undefined,403);await api(referee,'',{operation:'connect',sheet},403);
 const connected=await api(owner,'',{operation:'connect',sheet});assert.equal(connected.tabs.length,7);const tab=connected.tabs.find(t=>t.title==='D1 - Matches');
 const preview=await api(owner,'?tab='+tab.id);assert.equal(preview.rows.length,11);assert.equal(preview.rows.find(r=>r.source_id==='D1-M01').status,'ready');const pending=preview.rows.find(r=>r.status==='waiting');
 await api(owner,'',{operation:'confirm',tab:tab.id,hash:'0'.repeat(64),choices:[]},409);
 const choices=[{source_id:'D1-M01',selection:'C'},...(pending?[{source_id:pending.source_id,selection:'A'}]:[])];
 const results=await Promise.all([1,2].map(()=>api(owner,'',{operation:'confirm',tab:tab.id,hash:preview.hash,choices})));assert.equal(results.reduce((sum,r)=>sum+r.created,0),1);
 const {data:matches}=await db.from('matches').select('id,format,auto_coin_toss,coin_toss_forced').eq('event_id',eventId);assert.equal(matches.length,1);assert.equal(matches[0].format,'bo3');assert.equal(matches[0].auto_coin_toss,true);
 const {data:links}=await db.from('match_links').select('link_type,token').eq('match_id',matches[0].id);assert.equal(links.length,5);
 const {data:state}=await db.from('match_state').select('available_maps').eq('match_id',matches[0].id).single();assert.equal(state.available_maps.length,7);
 const {data:poolMaps}=await db.from('maps').select('name').in('id',state.available_maps);assert.deepEqual(poolMaps.map(m=>m.name).sort(),['Abyss','Bind','Breeze','Corrode','Haven','Pearl','Split']);
 const history=await api(referee,'?tab='+tab.id);const excluded=preview.rows.find(row=>!choices.some(c=>c.source_id===row.source_id));assert.equal(history.sources.find(s=>s.source_id===excluded.source_id).approved,false);if(pending)assert.equal(history.sources.find(s=>s.source_id===pending.source_id).selection,'A');
 await api(referee,'',{operation:'sync'},403);await api(owner,'',{operation:'sync'});assert.equal((await db.from('matches').select('id').eq('event_id',eventId)).data.length,1);
 for(const role of ['team_a','team_b']){const response=await fetch(base+'/api/veto/ready',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({match_id:matches[0].id,token:links.find(l=>l.link_type===role).token})});assert.equal(response.status,200);}
 const started=(await db.from('matches').select('status,coin_toss_winner').eq('id',matches[0].id).single()).data;assert.equal(started.status,'side_selection');assert.ok(['team_a','team_b'].includes(started.coin_toss_winner));
 assert.equal((await fetch(base+'/api/sheets/worker',{method:'POST',headers:{Authorization:'Bearer bad'}})).status,401);
 const {data:settings}=await db.from('sheet_worker_settings').select('secret').eq('id',true).single();
 await db.from('event_sheet_connections').update({last_sync_at:null,lease_until:null}).eq('event_id',eventId);
 const worker=await fetch(base+'/api/sheets/worker',{method:'POST',headers:{Authorization:'Bearer '+settings.secret}});assert.equal(worker.status,200);const worked=await worker.json();assert.ok(worked.results.some(r=>r.eventId===eventId));
 console.log('PASS live Sheets HTTP: 7 real tabs, 11 Day-1 pairings, pending opponents, checked-only creation, concurrent/repeated confirmation creates once, stale preview rejected, links/state/pool initialized, Referee read-only, outsider denied and authenticated worker');
 if(keep)writeFileSync('.qa-sheet-session.json',JSON.stringify({eventId,userIds,owner,tab,base,sheet}));
}finally{if(!keep && eventId)await cleanup({eventId,userIds});}
