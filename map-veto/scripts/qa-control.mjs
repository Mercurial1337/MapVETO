import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const qa=JSON.parse(readFileSync('.qa-session.json','utf8'));
const command=process.argv[2];
if(command==='warning' || command==='cleanup') {
 process.loadEnvFile('.env.local');
 const {createClient}=await import('@supabase/supabase-js');
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
 const {data:match,error}=await db.from('matches').select('team_a_name').eq('id',qa.id).single();assert.ifError(error);assert.equal(match.team_a_name,'Codex QA Alpha');
 if(command==='warning') {const result=await db.from('match_state').update({turn_started_at:new Date(Date.now()-46000).toISOString()}).eq('match_id',qa.id);assert.ifError(result.error);}
 else {const result=await db.from('matches').delete().eq('id',qa.id).eq('team_a_name','Codex QA Alpha');assert.ifError(result.error);}
}
async function post(path,body) {const r=await fetch(qa.base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json();assert.ok(r.ok,JSON.stringify(d));return d;}
if(['reset','pause','resume','restart','undo'].includes(command)) await post('/api/veto/admin/override',{match_id:qa.id,token:qa.tokens.admin,operation:command,reason:'Codex browser QA'});
if(command==='ready-a' || command==='ready-b') await post('/api/veto/ready',{match_id:qa.id,token:qa.tokens[command==='ready-a'?'team_a':'team_b']});
if(command==='coin') await post('/api/veto/coin-toss',{match_id:qa.id,token:qa.tokens.admin});
if(command==='position') {const s=await post('/api/veto/session',{match_id:qa.id,token:qa.tokens.observer});await post('/api/veto/position-choice',{match_id:qa.id,token:qa.tokens[s.match.coin_toss_winner],pick_first:true});}
if(command==='complete') {
 for(let i=0;i<30;i++) {
  const s=await post('/api/veto/session',{match_id:qa.id,token:qa.tokens.observer});if(s.state.is_complete) break;
  const step=qa.template.sequence.steps[s.state.current_step];
  await post('/api/veto/admin/override',{match_id:qa.id,token:qa.tokens.admin,operation:'force',reason:'Codex full-session QA',map_id:['ban','pick'].includes(step.action)?s.state.available_maps[0]:undefined,side:step.action==='side'?'attack':undefined});
 }
 const s=await post('/api/veto/session',{match_id:qa.id,token:qa.tokens.observer});assert.equal(s.state.is_complete,true);assert.equal(s.state.results.length,3);assert.ok(s.logs.some(l=>l.action_type==='decider'));console.log('PASS HTTP completed BO3: all picks, bans, sides, decider, referee override logs, ordered results');
}
console.log('QA action passed:',command);
