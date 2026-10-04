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
for(const operation of ['pause','resume','restart','undo','correct','force','reset']) await post('/api/veto/admin/override',{match_id:id,token:tokens.observer,operation,reason:'QA permission test'},403);
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
const requestId=randomUUID(),beforeRequest=session.state;
for(const role of ['observer','admin']) await post('/api/veto/timeouts',{operation:'request',match_id:id,token:tokens[role],request_id:requestId,reason:'Game disconnected'},403);
await post('/api/veto/timeouts',{operation:'request',match_id:id,token:tokens.team_a,request_id:requestId,reason:' '},400);
await Promise.all([1,2].map(()=>post('/api/veto/timeouts',{operation:'request',match_id:id,token:tokens.team_a,request_id:requestId,reason:'Game disconnected'})));
session=await post('/api/veto/session',{match_id:id,token:tokens.admin});
assert.equal(session.state.is_paused,false);assert.equal(session.state.turn_started_at,beforeRequest.turn_started_at);
assert.equal(session.logs.filter(log=>log.action_type==='timeout_request').length,1);
await post('/api/veto/timeouts',{operation:'request',match_id:id,token:tokens.team_a,request_id:randomUUID(),reason:'Duplicate problem'},409);
for(const role of ['team_a','team_b','observer']) await post('/api/veto/timeouts',{operation:'resolve',match_id:id,token:tokens[role],request_id:requestId,resolution:'Reconnected'},403);
const paused=await post('/api/veto/admin/override',{match_id:id,token:tokens.admin,operation:'pause',reason:'Investigate team timeout'});
const resolutionPayload={operation:'resolve',match_id:id,token:tokens.admin,request_id:requestId,resolution:'Connection restored'};
await post('/api/veto/timeouts',resolutionPayload);await post('/api/veto/timeouts',resolutionPayload);
session=await post('/api/veto/session',{match_id:id,token:tokens.team_a});
assert.equal(session.state.is_paused,true);assert.equal(session.state.paused_remaining_seconds,paused.new_state.paused_remaining_seconds);
assert.equal(session.logs.filter(log=>log.action_type==='timeout_resolved').length,1);
assert.equal(session.logs.find(log=>log.action_type==='timeout_resolved').metadata.resolution,'Connection restored');
const hiddenReports=await anon.from('veto_timeout_requests').select('*').eq('match_id',id);assert.equal(hiddenReports.data?.length || 0,0);
const directRequest=await anon.rpc('veto_request_timeout',{p_match_id:id,p_token:tokens.team_b,p_request_id:randomUUID(),p_reason:'Bypass API'});assert.ok(directRequest.error);
await post('/api/veto/admin/override',{match_id:id,token:tokens.admin,operation:'resume',reason:'Investigation finished'});
console.log('PASS HTTP team timeouts: team report reaches referee, retries deduplicated, resolution protected/audited, referee controls pause/resume independently');
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
if(keep) console.log('QA match:',id);
} finally {
 if(!keep) {const result=await db.from('matches').delete().eq('id',id).eq('team_a_name','Codex QA Alpha');assert.ifError(result.error);}
}
