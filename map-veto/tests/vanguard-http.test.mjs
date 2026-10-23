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
 const owner=await account(),vanguard=await account(),head=await account(),ref=await account(),outsider=await account();
 for(let i=0;i<2;i++){const id=randomUUID();assert.ifError((await db.from('events').insert({id,name:'Codex Vanguard Permissions QA',created_by:owner.id})).error);events.push(id);}
 const event=events[0],path=`/api/events/${event}/admins`;
 await request(path,'POST',null,{email:vanguard.email,role:'vanguard'},401);
 await request(path,'POST',owner,{email:vanguard.email,role:'vanguard'},201);
 assert.equal((await request(`/api/events/${event}`,'GET',vanguard)).role,'vanguard');
 assert.equal((await request('/api/events','GET',vanguard)).events.find(e=>e.id===event).role,'vanguard');
 await request(path,'POST',vanguard,{email:head.email,role:'admin'},201);
 const added=await request(path,'POST',vanguard,{email:ref.email,role:'referee'},201);
 assert.equal((await request(path,'GET',vanguard)).admins.length,3);
 for(const user of [head,ref,outsider]){await request(path,'GET',user,null,403);await request(path,'POST',user,{email:outsider.email,role:'admin'},403);}
 await request(path,'POST',vanguard,{email:outsider.email,role:'vanguard'},403);
 await request(path,'POST',vanguard,{email:outsider.email,role:'owner'},400);
 await request(path,'POST',vanguard,{email:owner.email,role:'admin'},400);
 await request(path,'POST',vanguard,{email:vanguard.email,role:'admin'},409);
 await request(`/api/events/${events[1]}/admins`,'POST',vanguard,{email:outsider.email,role:'admin'},403);
 await request(path+`?adminId=${added.admin.id}`,'DELETE',vanguard,null,403);
 await request(`/api/events/${event}`,'PUT',vanguard,{name:'Must not change branding'},404);
 const created=await request('/api/matches','POST',vanguard,{event_id:event,team_a_name:'Vanguard QA Alpha',team_b_name:'Vanguard QA Beta',format:'bo3'});matches.push(created.match.id);
 const links=await request(`/api/matches/${created.match.id}`,'POST',vanguard,{});assert.equal(links.links.admin.label,'Head Ref');assert.equal(Object.keys(links.links).length,5);
 await request('/api/veto/admin/override','POST',vanguard,{match_id:created.match.id,operation:'reset',reason:'Vanguard reset permission QA'});
 // Explicit observer links keep their view even while Vanguard is signed in.
 const snapshot=await request('/api/veto/session','POST',vanguard,{match_id:created.match.id,token:links.links.observer.token});assert.equal(snapshot.match.can_admin,false);
 await request('/api/veto/admin/override','POST',vanguard,{match_id:created.match.id,token:links.links.observer.token,operation:'reset',reason:'Observer must stay read-only'},403);
 await request(`/api/events/${event}/sheet`,'POST',ref,{operation:'stop',tab:1},403);
 await request(path+`?adminId=${added.admin.id}`,'DELETE',owner);
 assert.equal((await request(path,'GET',owner)).admins.length,2);
 console.log('PASS Vanguard HTTP: owner assignment, Vanguard staff additions, Head Ref/Referee restrictions, event isolation, no Vanguard/self/owner escalation, owner-only removals/branding, match creation/reset and links, explicit observer safety, Head Ref labels');
}finally{
 for(const id of matches)assert.ifError((await db.from('matches').delete().eq('id',id)).error);
 for(const id of events)assert.ifError((await db.from('events').delete().eq('id',id)).error);
 for(const id of users)assert.ifError((await db.auth.admin.deleteUser(id)).error);
 console.log('Cleaned up disposable Vanguard QA accounts, matches and events');
}
