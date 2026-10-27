import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {createServerClient} from '@supabase/ssr';
process.loadEnvFile('.env.local');
assert.equal(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname,'rmertbxmgsnxkqvdhbii.supabase.co','Use the VG Veto test environment');
const options={auth:{persistSession:false,autoRefreshToken:false}},users=[],events=[],matches=[];
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,options),base=process.env.TEST_APP_URL||'http://localhost:3333';
async function account(){
 const email=`vanguard-qa-${randomUUID()}@example.invalid`,password=randomUUID()+'aA!';
 const {data,error}=await db.auth.admin.createUser({email,password,email_confirm:true});assert.ifError(error);users.push(data.user.id);
 const jar=new Map(),client=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{...options,cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:items=>items.forEach(({name,value})=>jar.set(name,value))}});
 assert.ifError((await client.auth.signInWithPassword({email,password})).error);
 return {id:data.user.id,email,cookie:[...jar].map(([name,value])=>`${name}=${value}`).join('; ')};
}
async function request(path,method,user,body,status=200){
 const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',Cookie:user?.cookie||''},...(body?{body:JSON.stringify(body)}:{})});
 const data=await r.json();assert.equal(r.status,status,`${method} ${path}: ${JSON.stringify(data)}`);return data;
}
try{
 const owner=await account(),ref=await account();
 const sheet='1tifK0_pUo4iLxJ1cGVECxONf5B-fw0_u4iI8G1gh8NA';
 const createdEvent=await request('/api/events','POST',owner,{name:'Codex Sheet Recreation QA',google_sheet_id:sheet},201);const event=createdEvent.event.id;events.push(event);
 assert.ifError((await db.from('event_admins').insert({event_id:event,user_id:ref.id,role:'referee',added_by:owner.id})).error);
 const endpoint='/api/events/'+event+'/sheet',info=await request(endpoint,'GET',owner),tab=info.tabs.find(t=>t.title==='D2 - Matches');assert.ok(tab);
 let preview=await request(endpoint+'?tab='+tab.id,'GET',owner);const row=preview.rows.find(r=>r.source_id==='D2-M02');assert.equal(row?.status,'ready');
 await request(endpoint,'POST',owner,{operation:'confirm',tab:tab.id,hash:preview.hash,choices:[{source_id:row.source_id,selection:'C',scheduled_at:null}]});
 let source=(await db.from('sheet_match_sources').select('*').eq('event_id',event).eq('source_id',row.source_id).single()).data;assert.ok(source.match_id);const original=source.match_id;
 const oldLinks=(await request('/api/matches/'+original,'POST',owner,{})).links;
 await request('/api/matches/'+original,'DELETE',owner);
 const synced=await request(endpoint,'POST',owner,{operation:'sync'});assert.equal(synced.created,0);
 preview=await request(endpoint+'?tab='+tab.id,'GET',owner);source=preview.sources.find(s=>s.id===source.id);assert.equal(source.status,'deleted');assert.equal(source.match_id,null);
 const scheduled_at=new Date(Date.now()+86400000).toISOString();
 const body={operation:'recreate',tab:tab.id,hash:preview.hash,source:source.id,request_id:randomUUID(),selection:'B',scheduled_at};
 await request(endpoint,'POST',null,body,401);await request(endpoint,'POST',ref,body,403);assert.equal((await request(endpoint,'POST',owner,{...body,hash:'0'.repeat(64)},409)).stale,true);
 const [a,b]=await Promise.all([request(endpoint,'POST',owner,body),request(endpoint,'POST',owner,body)]);assert.equal(a.created+b.created,1);assert.equal(a.match_id,b.match_id);assert.notEqual(a.match_id,original);
 const edited=(await db.from('matches').select('*').eq('id',a.match_id).single()).data;assert.equal(edited.coin_toss_winner,'team_b');assert.equal(edited.coin_toss_forced,true);assert.equal(edited.auto_coin_toss,false);assert.equal(Date.parse(edited.veto_scheduled_at),Date.parse(scheduled_at));
 const newLinks=(await request('/api/matches/'+a.match_id,'POST',owner,{})).links;assert.equal(Object.keys(newLinks).length,5);for(const role of Object.keys(newLinks))assert.notEqual(newLinks[role].token,oldLinks[role].token);
 await request('/api/veto/session','POST',null,{match_id:original,token:oldLinks.observer.token},401);
 const repeated=await request(endpoint,'POST',owner,{operation:'sync'});assert.equal(repeated.created,0);
 const count=await db.from('matches').select('id').eq('event_id',event);assert.equal(count.data.length,1);
 await request(endpoint,'POST',owner,{...body,request_id:randomUUID()},409);
 if(row.password_status==='supplied'){const hashes=await db.from('match_team_passwords').select('password_hash,team_b_password_hash').eq('match_id',a.match_id).single();assert.ifError(hashes.error);assert.ok(hashes.data.password_hash.startsWith('scrypt$'));assert.ok(hashes.data.team_b_password_hash.startsWith('scrypt$'));}
 await request('/api/matches/'+a.match_id,'DELETE',owner);
 preview=await request(endpoint+'?tab='+tab.id,'GET',owner);
 await request(endpoint,'POST',owner,{...body,hash:preview.hash,request_id:randomUUID(),selection:'D'},400);
 await request(endpoint,'POST',owner,{...body,hash:preview.hash,request_id:randomUUID(),scheduled_at:'18:00'},400);
 const cleared=await request(endpoint,'POST',owner,{...body,hash:preview.hash,request_id:randomUUID(),selection:'C',scheduled_at:null});
 await request(endpoint,'POST',owner,{operation:'sync'});
 const noSchedule=(await db.from('matches').select('*').eq('id',cleared.match_id).single()).data;assert.equal(noSchedule.veto_scheduled_at,null);assert.equal(noSchedule.veto_schedule_enforced,false);assert.equal(noSchedule.auto_coin_toss,true);assert.equal(noSchedule.coin_toss_forced,false);assert.equal(noSchedule.coin_toss_winner,null);
 console.log('PASS real sheet recreation HTTP: editable higher seed and schedule, clearing schedule and restoring automatic coin toss, invalid edits rejected, sync preserves edits, login/role/stale checks, concurrency, new links and passwords retained');
}finally{
 for(const event of events){assert.ifError((await db.from('matches').delete().eq('event_id',event)).error);assert.ifError((await db.from('events').delete().eq('id',event)).error);}
 for(const id of users)assert.ifError((await db.auth.admin.deleteUser(id)).error);
 console.log('Cleaned up disposable sheet recreation fixtures');
}
