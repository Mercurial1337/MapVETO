import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
process.loadEnvFile('.env.local');
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY),base=process.env.TEST_APP_URL||'http://127.0.0.1:3001',ids=[];
async function post(path,body,status=200){const response=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await response.json();assert.equal(response.status,status,JSON.stringify(data));return data;}
async function fixture(format,when,seeded=false){
 const {data:t,error}=await db.from('veto_templates').select('id').eq('format',format).order('is_default',{ascending:false}).limit(1).single();assert.ifError(error);
 const id=randomUUID();ids.push(id);assert.ifError((await db.from('matches').insert({id,veto_template_id:t.id,team_a_name:'Codex Schedule Alpha',team_b_name:'Codex Schedule Beta',format,status:'ready_check',auto_coin_toss:true,coin_toss_forced:seeded,coin_toss_winner:seeded?'team_a':null,veto_schedule_enforced:true,veto_scheduled_at:new Date(when).toISOString()})).error);
 assert.ifError((await db.from('match_state').update({available_maps:maps.map(m=>m.id)}).eq('match_id',id)).error);
 const {data:links,error:le}=await db.from('match_links').select('link_type,token').eq('match_id',id);assert.ifError(le);return {id,links:Object.fromEntries(links.map(l=>[l.link_type,l.token]))};
}
const team=(f,role)=>({match_id:f.id,token:f.links[role]});
const snapshot=f=>post('/api/veto/session',team(f,'observer'));
async function waitFor(f,test){for(let i=0;i<60;i++){const data=await snapshot(f);if(test(data))return data;await new Promise(r=>setTimeout(r,500));}throw Error('Scheduler did not enforce no-show deadline');}
const {data:maps,error:mapError}=await db.from('maps').select('id,name').eq('is_active',true).in('name',['Abyss','Bind','Corrode','Haven','Lotus','Summit','Sunset']).order('name');assert.ifError(mapError);assert.equal(maps.length,7);
try{
 const future=await fixture('bo3',Date.now()+3600000);const early=await post('/api/veto/ready',team(future,'team_a'),400);assert.match(early.error,/not opened/);
 const deadline=Date.now()+15000;
 const both=await fixture('bo3',deadline-600000),bo5=await fixture('bo5',deadline-600000),single=await fixture('bo3',deadline-600000,true);
 await post('/api/veto/ready',team(single,'team_a'));
 const result=await waitFor(both,d=>d.state.is_complete);assert.equal(result.state.results.length,3);assert.deepEqual(result.state.results.map(p=>maps.find(m=>m.id===p.map_id).name),['Abyss','Bind','Corrode']);assert.ok(result.state.results.every(p=>['attack','defense'].includes(p.side)));
 assert.equal((await waitFor(bo5,d=>d.state.is_complete)).state.results.length,5);
 const pending=await waitFor(single,d=>d.match.status==='side_selection');assert.deepEqual(pending.match.veto_no_show_teams,['team_b']);
 const late=await post('/api/veto/ready',team(single,'team_b'),400);assert.match(late.error,/deadline missed/);
 await post('/api/veto/position-choice',{...team(single,'team_a'),pick_first:true});let s=await snapshot(single);
 await post('/api/veto/action',{...team(single,'team_a'),action:'ban',map_id:s.state.available_maps[0],turn_started_at:s.state.turn_started_at});s=await snapshot(single);assert.equal(s.state.current_turn,'team_a');assert.equal(s.state.banned_maps.length,2);assert.equal(s.state.banned_maps[1].is_auto,true);
 await post('/api/veto/admin/override',{...team(single,'admin'),operation:'reset',reason:'Scheduled QA reset'});
 s=await snapshot(single);assert.equal(s.match.veto_schedule_enforced,false);assert.equal(s.match.veto_scheduled_at,null);assert.deepEqual(s.match.veto_no_show_teams,[]);
 await post('/api/veto/ready',team(single,'team_a'));await post('/api/veto/ready',team(single,'team_b'));
 assert.equal((await snapshot(single)).match.status,'side_selection');
 console.log('PASS scheduled HTTP + real pg_cron: early/late check-in denied, no-browser deadline completion, BO3/BO5 alphabetical defaults and random sides, present team plays, absent turn automatic, Head Admin restart restores ordinary check-in');
}finally{for(const id of ids)assert.ifError((await db.from('matches').delete().eq('id',id)).error);}
