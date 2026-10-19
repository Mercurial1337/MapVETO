import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {createServerClient} from '@supabase/ssr';
process.loadEnvFile('.env.local');
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
const base=process.env.TEST_APP_URL || 'http://localhost:3001',ids=[];
let userId;
async function post(path,body,expected=200,cookie='') {
 const response=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(body)});
 const data=await response.json();assert.equal(response.status,expected,JSON.stringify(data));return data;
}
try {
 const email=`normal-match-${randomUUID()}@example.invalid`,password=randomUUID()+'aA!';
 const {data,error}=await db.auth.admin.createUser({email,password,email_confirm:true});assert.ifError(error);userId=data.user.id;
 const jar=new Map(),client=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:items=>items.forEach(({name,value})=>jar.set(name,value))}});
 assert.ifError((await client.auth.signInWithPassword({email,password})).error);
 const cookie=[...jar].map(([name,value])=>`${name}=${value}`).join('; ');
 const page=await fetch(base+'/admin/matches/new',{headers:{Cookie:cookie}});
 assert.equal(page.status,200);assert.ok((await page.text()).includes('coin toss runs automatically'));
 const payload={team_a_name:'Codex Normal Alpha',team_b_name:'Codex Normal Beta'};
 await post('/api/matches',payload,401);
 for(const [format,seed] of [['bo1',undefined],['bo3',null],['bo5','none'],['bo3','team_a'],['bo3','team_b']]) {
  const created=await post('/api/matches',{...payload,format,...(seed!==undefined?{higher_seed:seed}:{})},200,cookie);
  const id=created.match.id;ids.push(id);assert.equal(Object.keys(created.links).length,5);
  const seeded=seed==='team_a'||seed==='team_b';
  const {data:saved,error:savedError}=await db.from('matches').select('auto_coin_toss,coin_toss_forced').eq('id',id).single();assert.ifError(savedError);
  assert.equal(saved.auto_coin_toss,!seeded);assert.equal(saved.coin_toss_forced,seeded);
  const team=role=>({match_id:id,token:created.links[role].token});
  await post('/api/veto/ready',team('team_a'));
  let session=await post('/api/veto/session',team('observer'));
  assert.equal(session.match.status,'ready_check');assert.equal(session.logs.filter(l=>l.action_type==='coin_toss').length,0);
  await Promise.all([post('/api/veto/ready',team('team_b')),post('/api/veto/ready',team('team_a'))]);
  session=await post('/api/veto/session',team('observer'));assert.equal(session.match.status,'side_selection');
  const winner=session.match.coin_toss_winner;assert.ok(['team_a','team_b'].includes(winner));
  if(seeded)assert.equal(winner,seed);
  else assert.equal(session.logs.filter(l=>l.action_type==='coin_toss' && l.metadata?.automatic_coin_toss).length,1);
  await Promise.all(['team_a','team_b'].map(role=>post('/api/veto/ready',team(role))));
  session=await post('/api/veto/session',team('observer'));assert.equal(session.match.coin_toss_winner,winner);
  if(!seeded)assert.equal(session.logs.filter(l=>l.action_type==='coin_toss').length,1);
  await post('/api/veto/position-choice',{...team(winner),pick_first:true});
  session=await post('/api/veto/session',team('observer'));assert.equal(session.match.status,'in_progress');
  assert.equal(session.state.available_maps.length,7);
  const {data:poolMaps,error:poolError}=await db.from('maps').select('name').in('id',session.state.available_maps);assert.ifError(poolError);
  assert.deepEqual(poolMaps.map(map=>map.name).sort(),['Abyss','Bind','Corrode','Haven','Lotus','Summit','Sunset']);
 }
 console.log('PASS normal creation: BO1/BO3/BO5 auto toss after both ready only, one toss on retries, winner chooses role, A/B higher seeds preserved, five links and seven maps');
} finally {
 for(const id of ids)assert.ifError((await db.from('matches').delete().eq('id',id)).error);
 if(userId)assert.ifError((await db.auth.admin.deleteUser(userId)).error);
}
