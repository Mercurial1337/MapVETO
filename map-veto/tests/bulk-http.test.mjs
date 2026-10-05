import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {writeFileSync, readFileSync, unlinkSync} from 'node:fs';
import {createClient} from '@supabase/supabase-js';
import {createServerClient} from '@supabase/ssr';
process.loadEnvFile('.env.local');
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
const base=process.env.TEST_APP_URL || 'http://localhost:3001';
const keep=process.argv.includes('--keep');
const users=[];let eventId;
async function cleanup(session) {
 const {data:event,error}=await db.from('events').select('name').eq('id',session.eventId).single();assert.ifError(error);
 assert.ok(event.name.startsWith('Codex bulk QA '));
 assert.ifError((await db.from('matches').delete().eq('event_id',session.eventId)).error);
 assert.ifError((await db.from('events').delete().eq('id',session.eventId)).error);
 for(const userId of session.userIds)assert.ifError((await db.auth.admin.deleteUser(userId)).error);
}
if(process.argv.includes('--cleanup')) {
 await cleanup(JSON.parse(readFileSync('.qa-bulk-session.json','utf8')));unlinkSync('.qa-bulk-session.json');console.log('PASS bulk QA fixtures removed');
} else {
async function account() {
 const email=`bulk-${randomUUID()}@example.invalid`,password=randomUUID()+'aA!';
 const {data,error}=await db.auth.admin.createUser({email,password,email_confirm:true});assert.ifError(error);users.push(data.user.id);
 const jar=new Map();const client=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:items=>items.forEach(({name,value})=>jar.set(name,value))}});
 assert.ifError((await client.auth.signInWithPassword({email,password})).error);
 return {id:data.user.id,email,password,client,cookie:[...jar].map(([name,value])=>`${name}=${value}`).join('; ')};
}
async function upload(cookie,text,batchId=randomUUID(),filename='matches.csv',expected=200) {
 const body=new FormData();body.set('file',new File([text],filename));body.set('format','bo3');body.set('batch_id',batchId);
 const response=await fetch(`${base}/api/events/${eventId}/bulk-matches`,{method:'POST',headers:{Cookie:cookie},body});
 const data=await response.json();assert.equal(response.status,expected,JSON.stringify(data));return data;
}
async function post(path,body,expected=200) {
 const response=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await response.json();assert.equal(response.status,expected,JSON.stringify(data));return data;
}
let retained=false;
try {
 const owner=await account(),outsider=await account(),admin=await account();eventId=randomUUID();
 assert.ifError((await db.from('events').insert({id:eventId,name:'Codex bulk QA '+eventId,created_by:owner.id})).error);
 assert.ifError((await db.from('event_admins').insert({event_id:eventId,user_id:admin.id,added_by:owner.id})).error);
 const sample='Match Number, Team A, Team B, Higher Seed (A/B) or Coin Flip (C)\n1, Fnatic, Sentinels, A\n2, Paper Rex, LOUD, B\n3, G2, Liquid, C\n';
 await upload('',sample,randomUUID(),'matches.csv',401);
 await upload(outsider.cookie,sample,randomUUID(),'matches.csv',403);
 await upload(owner.cookie,'1, Bad, Row, D',randomUUID(),'matches.csv',400);
 await upload(owner.cookie,sample,randomUUID(),'matches.exe',400);
 await upload(owner.cookie,'x'.repeat(1024*1024+1),randomUUID(),'large.txt',413);
 assert.equal((await db.from('matches').select('id').eq('event_id',eventId)).data.length,0);
 const batchId=randomUUID(),imported=await upload(owner.cookie,sample,batchId);assert.equal(imported.match_count,3);
 const retry=await upload(owner.cookie,sample,batchId);assert.equal(retry.reused,true);assert.equal(retry.match_ids.length,3);
 await upload(owner.cookie,sample.replace('Fnatic','Different'),batchId,'matches.csv',409);
 const response=await fetch(`${base}/api/events/${eventId}/bulk-matches`,{headers:{Cookie:owner.cookie}});assert.equal(response.status,200);assert.equal((await response.json()).batches[0].id,batchId);
 assert.equal((await fetch(`${base}/api/events/${eventId}/bulk-matches`,{headers:{Cookie:outsider.cookie}})).status,403);
 assert.equal((await outsider.client.from('match_import_batches').select('id').eq('event_id',eventId)).data.length,0);
 console.log('PASS HTTP bulk upload: authentication, event permissions, invalid rows/extensions/size, no partial imports, retry protection, private batch listing');
 const {data:matches,error}=await db.from('matches').select('*').eq('bulk_batch_id',batchId).order('match_number');assert.ifError(error);
 for(const match of matches) {
  const {data:links}=await db.from('match_links').select('link_type,token').eq('match_id',match.id);assert.equal(links.length,4);
  const tokens=Object.fromEntries(links.map(link=>[link.link_type,link.token]));
  const linkResponse=await fetch(`${base}/api/matches/${match.id}`,{method:'POST',headers:{Cookie:owner.cookie}});assert.equal(linkResponse.status,200);assert.equal(Object.keys((await linkResponse.json()).links).length,4);
  await Promise.all(['team_a','team_b'].map(role=>post('/api/veto/ready',{match_id:match.id,token:tokens[role]})));
  let session=await post('/api/veto/session',{match_id:match.id,token:tokens.observer});assert.equal(session.match.status,'side_selection');assert.equal(session.state.available_maps.length,7);
  const winner=session.match.coin_toss_winner;assert.ok(['team_a','team_b'].includes(winner));
  if(match.match_number<3)assert.equal(winner,match.match_number===1?'team_a':'team_b');
  else {
   assert.equal(session.logs.filter(log=>log.action_type==='coin_toss' && log.metadata?.automatic_coin_toss).length,1);
   await Promise.all(['team_a','team_b'].map(role=>post('/api/veto/ready',{match_id:match.id,token:tokens[role]})));
   session=await post('/api/veto/session',{match_id:match.id,token:tokens.observer});assert.equal(session.match.coin_toss_winner,winner);assert.equal(session.logs.filter(log=>log.action_type==='coin_toss').length,1);
  }
  await post('/api/veto/position-choice',{match_id:match.id,token:tokens[winner==='team_a'?'team_b':'team_a'],pick_first:false},400);
  await post('/api/veto/position-choice',{match_id:match.id,token:tokens[winner],pick_first:false});
  session=await post('/api/veto/session',{match_id:match.id,token:tokens.observer});assert.equal(session.match.status,'in_progress');
 }
 console.log('PASS HTTP bulk check-in: A/B seed choice, concurrent C readiness triggers one automatic toss, winner chooses role, four usable links and seven maps');
 const many=Array.from({length:25},(_,i)=>`${i+1}, Page A ${i+1}, Page B ${i+1}, C`).join('\n');
 const second=await upload(admin.cookie,many,randomUUID(),'matches.csv');
 const {data:page,error:pageError}=await admin.client.from('matches').select('match_number').eq('event_id',eventId).eq('bulk_batch_id',second.batch_id).order('match_number').range(20,39);assert.ifError(pageError);assert.deepEqual(page.map(row=>row.match_number),[21,22,23,24,25]);
 console.log('PASS HTTP bulk event admin: separate batches with same filename, all 25 matches created, filtered pagination includes only the selected batch');
 if(keep){writeFileSync('.qa-bulk-session.json',JSON.stringify({base,eventId,userIds:users,owner,batchId,secondBatchId:second.batch_id},(key,value)=>key==='client'||key==='cookie'?undefined:value));retained=true;console.log('QA fixtures retained for browser testing');}
} finally {
 if(!retained) {
  if(eventId)await cleanup({eventId,userIds:users});
  else for(const userId of users)await db.auth.admin.deleteUser(userId);
 }
}
}
