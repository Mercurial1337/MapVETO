import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {writeFileSync,readFileSync,unlinkSync} from 'node:fs';
import {createClient} from '@supabase/supabase-js';
process.loadEnvFile('.env.local');
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
const base=process.env.TEST_APP_URL || 'http://127.0.0.1:3001',keep=process.argv.includes('--keep');
async function cleanup(id){assert.ifError((await db.from('matches').delete().eq('id',id).eq('team_a_name','Codex clock QA Alpha')).error);}
if(process.argv.includes('--cleanup')){const qa=JSON.parse(readFileSync('.qa-clock-session.json','utf8'));await cleanup(qa.id);unlinkSync('.qa-clock-session.json');process.exit(0);}
if(process.argv.includes('--cleanup-orphans')){assert.ifError((await db.from('matches').delete().eq('team_a_name','Codex clock QA Alpha').eq('team_b_name','Codex clock QA Beta')).error);process.exit(0);}
if(process.argv.includes('--near-expiry')){const qa=JSON.parse(readFileSync('.qa-clock-session.json','utf8'));assert.ifError((await db.from('match_state').update({turn_started_at:new Date(Date.now()-56000).toISOString(),automation_enabled:false}).eq('match_id',qa.id)).error);process.exit(0);}
async function post(path,body,expected=200){const response=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await response.json();assert.equal(response.status,expected,JSON.stringify(data));return data;}
const {data:template,error}=await db.from('veto_templates').select('*').eq('format','bo3').eq('is_default',true).single();assert.ifError(error);
const {data:maps}=await db.from('maps').select('id').eq('game_id',template.game_id).eq('is_active',true).limit(7);
const id=randomUUID();let channel;const anon=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
try {
 assert.ifError((await db.from('matches').insert({id,veto_template_id:template.id,team_a_name:'Codex clock QA Alpha',team_b_name:'Codex clock QA Beta',format:'bo3',status:'ready_check'})).error);
 assert.ifError((await db.from('match_state').update({available_maps:maps.map(m=>m.id)}).eq('match_id',id)).error);
 const {data:links}=await db.from('match_links').select('link_type,token').eq('match_id',id);const tokens=Object.fromEntries(links.map(link=>[link.link_type,link.token]));
 await post('/api/veto/ready',{match_id:id,token:tokens.team_a});await post('/api/veto/ready',{match_id:id,token:tokens.team_b});
 const toss=await post('/api/veto/coin-toss',{match_id:id,token:tokens.admin});await post('/api/veto/position-choice',{match_id:id,token:tokens[toss.match.coin_toss_winner],pick_first:true});
 assert.ifError((await db.from('match_state').update({automation_enabled:false}).eq('match_id',id)).error);
 let events=0;const payloads=[];
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Realtime subscribe timed out')),10000);channel=anon.channel('match:'+id).on('broadcast',{event:'veto_changed'},message=>{payloads.push(message.payload);events++;}).subscribe(status=>{if(status==='SUBSCRIBED'){clearTimeout(timer);resolve();}});});
 const sessions=await Promise.all(Object.values(tokens).map(token=>post('/api/veto/session',{match_id:id,token})));
 assert.ok(sessions.every(s=>s.state.turn_started_at===sessions[0].state.turn_started_at && s.state.current_step===0));
 assert.ok(sessions.every(s=>Number.isFinite(s.server_time) && s.server_processing_ms>=0));
 assert.ok(Math.max(...sessions.map(s=>s.server_time))-Math.min(...sessions.map(s=>s.server_time))<2000);
 console.log('PASS synchronized HTTP sessions: all five roles share turn/deadline; database UTC and server-processing samples supplied');
 // Database rejects a client that tries to expire a future turn.
 await post('/api/veto/auto-action',{match_id:id,token:tokens.team_a,turn_started_at:sessions[0].state.turn_started_at},409);
 const expired=new Date(Date.now()-61000).toISOString();
 assert.ifError((await db.from('match_state').update({turn_started_at:expired}).eq('match_id',id)).error);
 await new Promise(resolve=>setTimeout(resolve,250));const before=events;
 const started=performance.now();
 const outcomes=await Promise.all(Object.values(tokens).map(async token=>{const response=await fetch(base+'/api/veto/auto-action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({match_id:id,token,turn_started_at:expired})});return {status:response.status,data:await response.json()};}));
 assert.equal(outcomes.filter(r=>r.status===200).length,1);assert.ok(outcomes.every(r=>[200,409].includes(r.status)));
 const successful=outcomes.find(r=>r.status===200);assert.equal(successful.data.new_state.current_step,1);assert.equal(successful.data.match.status,'in_progress');
 for(let i=0;i<20 && events<=before;i++)await new Promise(resolve=>setTimeout(resolve,100));assert.ok(events>before,'Committed timeout must invalidate connected links');
 assert.ok(payloads.every(payload=>Object.keys(payload).every(key=>key==='id')),'Only the Supabase-generated broadcast ID may be present');
 const state=await post('/api/veto/session',{match_id:id,token:tokens.observer});assert.equal(state.state.current_step,1);assert.equal(state.logs.filter(log=>log.metadata?.timeout).length,1);
 console.log(`PASS expiry race: five simultaneous links produce one random ban, immediately returned state and token-free database invalidation (${Math.round(performance.now()-started)} ms total)`);
 assert.ifError((await db.from('match_state').update({automation_enabled:true}).eq('match_id',id)).error);
 if(keep)writeFileSync('.qa-clock-session.json',JSON.stringify({id,tokens,template,base}));
}finally{if(channel)await anon.removeChannel(channel);if(!keep)await cleanup(id);}
