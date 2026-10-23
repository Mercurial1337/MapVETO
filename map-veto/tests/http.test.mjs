import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {randomUUID} from 'node:crypto';
import {writeFileSync} from 'node:fs';
process.loadEnvFile('.env.local');
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
const base=process.env.TEST_APP_URL || 'http://localhost:3000';
const keep=process.argv.includes('--keep');
async function post(path,body,expected=200,method='POST') {
 const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const data=await response.json();assert.equal(response.status,expected,`${path}: ${JSON.stringify(data)}`);return data;
}
const {data:template,error:templateError}=await db.from('veto_templates').select('*').eq('format','bo3').eq('is_default',true).single();assert.ifError(templateError);
const {data:maps}=await db.from('maps').select('id').eq('game_id',template.game_id).eq('is_active',true).limit(7);
const id=randomUUID();
const {error}=await db.from('matches').insert({id,veto_template_id:template.id,team_a_name:'Codex QA Alpha',team_b_name:'Codex QA Beta',format:'bo3',status:'ready_check'});assert.ifError(error);
await db.from('match_state').update({available_maps:maps.map(m=>m.id)}).eq('match_id',id);
const {data:links}=await db.from('match_links').select('link_type,token').eq('match_id',id);
const tokens=Object.fromEntries(links.map(l=>[l.link_type,l.token]));
if(keep) writeFileSync('.qa-session.json',JSON.stringify({id,tokens,template,base}));
try {
for(const path of ['ready','coin-toss','position-choice','action']) {
 const payload={match_id:id,token:tokens.observer,pick_first:true,action:'ban',map_id:maps[0].id};
 await post('/api/veto/'+path,payload,path==='coin-toss'?403:400);
}
for(const operation of ['pause','resume','restart','undo','correct','force','reset','reopen_step']) await post('/api/veto/admin/override',{match_id:id,token:tokens.observer,operation,reason:'QA permission test'},403);
await post(`/api/matches/${id}`,{},403);await post(`/api/matches/${id}`,{action:'reset'},403,'PATCH');await post(`/api/matches/${id}`,{},403,'DELETE');
await post('/api/veto/session',{match_id:id,token:randomUUID()},401);
const anon=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const unauthorized=await anon.rpc('veto_admin',{p_match_id:id,p_token:tokens.admin,p_operation:'reset',p_reason:'QA'});assert.ok(unauthorized.error);
const stolen=await anon.from('match_links').select('*').eq('match_id',id);assert.equal(stolen.data?.length || 0,0);
console.log('PASS HTTP spectator: team actions denied, all overrides denied, link retrieval/reset/delete denied, invalid link rejected, direct RPC denied, tokens hidden');
await Promise.all([post('/api/veto/ready',{match_id:id,token:tokens.team_a}),post('/api/veto/ready',{match_id:id,token:tokens.team_b})]);
let session=await post('/api/veto/session',{match_id:id,token:tokens.observer});assert.equal(session.match.status,'coin_toss');assert.equal(session.logs.length,2);
for(const role of ['team_a','team_b','observer']) {
 await post('/api/veto/coin-toss',{match_id:id,token:tokens[role]},403);
 await post('/api/veto/coin-toss',{match_id:id,token:tokens[role],forced_winner:'team_a'},403);
}
await post('/api/veto/coin-toss',{match_id:id},403);
session=await post('/api/veto/session',{match_id:id,token:tokens.observer});
assert.equal(session.match.status,'coin_toss');assert.equal(session.logs.length,2);
const coin=await post('/api/veto/coin-toss',{match_id:id,token:tokens.admin});
console.log('PASS HTTP coin toss: both teams and observer denied random/forced toss; only authorized admin can start');
await post('/api/veto/position-choice',{match_id:id,token:tokens[coin.match.coin_toss_winner],pick_first:true});
session=await post('/api/veto/session',{match_id:id,token:tokens.observer});assert.equal(session.match.status,'in_progress');
console.log('PASS HTTP check-in: concurrent readiness, coin toss, role confirmation, coherent observer state');
// Timeout requests were removed: the endpoint no longer exists and the tables stay service-only.
for(const token of [tokens.team_a,tokens.referee,tokens.admin]){const r=await fetch(base+'/api/veto/timeouts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation:'request',match_id:id,token,request_id:randomUUID(),reason:'Removed'})});assert.equal(r.status,404);}
const hiddenReports=await anon.from('veto_timeout_requests').select('*').eq('match_id',id);assert.equal(hiddenReports.data?.length || 0,0);
const directRequest=await anon.rpc('veto_request_timeout',{p_match_id:id,p_token:tokens.team_b,p_request_id:randomUUID(),p_reason:'Bypass API'});assert.ok(directRequest.error);
// Only Head Refs pause; Referees and teams cannot.
for(const role of ['referee','team_a','observer']) await post('/api/veto/admin/override',{match_id:id,token:tokens[role],operation:'pause',reason:'Not allowed'},403);
const paused=await post('/api/veto/admin/override',{match_id:id,token:tokens.admin,operation:'pause',reason:'Head Ref pause'});
session=await post('/api/veto/session',{match_id:id,token:tokens.team_a});assert.equal(session.state.is_paused,true);assert.equal(session.state.paused_remaining_seconds,paused.new_state.paused_remaining_seconds);
await post('/api/veto/admin/override',{match_id:id,token:tokens.admin,operation:'resume',reason:'Resume'});
console.log('PASS HTTP staff controls: timeout endpoint removed, timeout data private, only Head Ref pauses/resumes');
for(let i=0;i<30;i++) {
 session=await post('/api/veto/session',{match_id:id,token:tokens.observer});
 if(session.state.is_complete) break;
 const step=template.sequence.steps[session.state.current_step];
 await post('/api/veto/admin/override',{match_id:id,token:tokens.admin,operation:'force',reason:'Codex HTTP full-session QA',map_id:['ban','pick'].includes(step.action)?session.state.available_maps[0]:undefined,side:step.action==='side'?'attack':undefined});
}
session=await post('/api/veto/session',{match_id:id,token:tokens.observer});
assert.equal(session.state.is_complete,true);assert.equal(session.state.results.length,3);
assert.ok(session.logs.some(log=>log.action_type==='decider'));
console.log('PASS HTTP full BO3: bans, picks, sides, decider, completion and referee audit');
const publicResponse=await fetch(`${base}/api/matches/${id}/public`);
assert.equal(publicResponse.status,200);
const publicVeto=await publicResponse.json();
assert.equal(publicVeto.best_of,3);assert.equal(publicVeto.is_complete,true);
assert.deepEqual(publicVeto.actions.map(action=>action.type),template.sequence.steps.map(step=>({ban:'ban_map',pick:'pick_map',side:'pick_side',decider:'decider'})[step.action]));
assert.ok(publicVeto.actions.every(action=>typeof action.map==='string' && action.map!=='Unknown'));
const listingResponse=await fetch(`${base}/api/matches/public?status=completed&limit=100`);
assert.equal(listingResponse.status,200);const listing=await listingResponse.json();
assert.equal(listing.pagination.count,listing.matches.length);assert.ok(listing.matches.some(match=>match.id===id));
const logResponse=await fetch(`${base}/public/log/${id}`);assert.equal(logResponse.status,200);
const logHtml=await logResponse.text();assert.ok(logHtml.includes('Veto log'));assert.ok(logHtml.includes('Picked by'));assert.ok(logHtml.includes('Codex QA Alpha'));assert.ok(logHtml.includes('was left as the Decider'));
console.log('PASS public outputs: ordered veto actions, map names, completed-match listing and rendered public log');
const reopenPayload={match_id:id,token:tokens.admin,operation:'reopen_step',target_step:2,current_step:session.state.current_step,turn_started_at:session.state.turn_started_at,request_id:randomUUID(),reason:'Codex HTTP disputed selection'};
for(const role of ['team_a','team_b','referee','observer'])await post('/api/veto/admin/override',{...reopenPayload,token:tokens[role]},403);
await post('/api/veto/admin/override',{...reopenPayload,request_id:undefined},400);
await post('/api/veto/admin/override',{...reopenPayload,current_step:0},409);
const reopened=await post('/api/veto/admin/override',reopenPayload);
assert.equal(reopened.new_state.current_step,2);assert.equal(reopened.match.status,'in_progress');assert.equal(reopened.new_state.is_complete,false);
await post('/api/veto/admin/override',reopenPayload);
session=await post('/api/veto/session',{match_id:id,token:tokens.observer});
assert.equal(session.logs.filter(log=>log.metadata?.request_id===reopenPayload.request_id).length,1);
assert.ok(session.logs.some(log=>log.action_type==='decider' && log.metadata?.superseded));
// A reopened veto is live again, so it is private until it completes again.
assert.equal((await fetch(`${base}/api/matches/${id}/public`)).status,404);
console.log('PASS HTTP reopening: Head Ref only, validation, stale guard, completed-veto restoration, idempotency, audit, and the reopened veto is private again');
// Complete the disposable match again so browser QA can choose any earlier step.
while(!session.state.is_complete) {
 const step=template.sequence.steps[session.state.current_step];
 await post('/api/veto/admin/override',{match_id:id,token:tokens.admin,operation:'force',reason:'Codex HTTP replay QA',map_id:['ban','pick'].includes(step.action)?session.state.available_maps[0]:undefined,side:step.action==='side'?'attack':undefined});
 session=await post('/api/veto/session',{match_id:id,token:tokens.observer});
}
const completedPublic=await (await fetch(`${base}/api/matches/${id}/public`)).json();
assert.equal(completedPublic.is_complete,true);assert.equal(completedPublic.actions.length,template.sequence.steps.length,'public actions exclude superseded selections');
console.log('PASS HTTP re-completion: public again once complete, with superseded selections excluded');
if(keep) console.log('QA match:',id);
} finally {
 if(!keep) {const result=await db.from('matches').delete().eq('id',id).eq('team_a_name','Codex QA Alpha');assert.ifError(result.error);}
}
