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
 const owner=await account(),head=await account(),ref=await account(),vanguard=await account(),outsider=await account();
 const event=randomUUID();events.push(event);assert.ifError((await db.from('events').insert({id:event,name:'Codex Staff Login QA',created_by:owner.id})).error);
 for(const [user,role] of [[head,'admin'],[ref,'referee'],[vanguard,'vanguard']])assert.ifError((await db.from('event_admins').insert({event_id:event,user_id:user.id,role,added_by:owner.id})).error);
 const created=await request('/api/matches','POST',head,{event_id:event,team_a_name:'Private Staff QA Alpha',team_b_name:'Private Staff QA Beta',format:'bo3'});const id=created.match.id;matches.push(id);
 const links=await request('/api/matches/'+id,'POST',owner,{});
 const session=(role,user,status=200)=>request('/api/veto/session','POST',user,{match_id:id,token:links.links[role].token},status);
 for(const role of ['admin','referee']){
  const blocked=await session(role,null,401);assert.equal(blocked.login_required,true);assert.equal(blocked.match,undefined);
  await session(role,outsider,403);
  const page=await fetch(base+'/match/'+id+'?token='+links.links[role].token,{redirect:'manual'});assert.equal(page.status,307);const login=new URL(page.headers.get('location'),base);assert.equal(login.pathname,'/');assert.equal(login.searchParams.get('next'),'/match/'+id+'?token='+links.links[role].token);
  const denied=await (await fetch(base+'/match/'+id+'?token='+links.links[role].token,{headers:{Cookie:outsider.cookie}})).text();assert.ok(denied.includes('does not have permission'));assert.ok(!denied.includes('Private Staff QA Alpha'));
 }
 await session('admin',ref,403);assert.equal((await session('referee',ref)).match.can_referee,true);
 for(const user of [owner,head,vanguard]){assert.equal((await session('admin',user)).match.can_admin,true);const limited=await session('referee',user);assert.equal(limited.match.can_admin,false);assert.equal(limited.userRole,'referee');}
 for(const role of ['observer','team_a','team_b']){const open=await session(role,null);assert.equal(open.match.can_admin,false);assert.equal((await session(role,owner)).match.can_admin,false);}
 const credentials={match_id:id,token:links.links.admin.token};
 for(const [path,payload] of [['ready',{}],['position-choice',{pick_first:true}],['action',{action:'ban',map_id:randomUUID()}],['auto-action',{turn_started_at:new Date().toISOString()}]])await request('/api/veto/'+path,'POST',null,{...credentials,...payload},401);
 await request('/api/veto/admin/override','POST',null,{...credentials,operation:'reset',reason:'Must require login'},403);
 await request('/api/veto/coin-toss','POST',null,credentials,403);
 await request('/api/veto/reset-requests','POST',null,{match_id:id,token:links.links.referee.token,operation:'request',request_id:randomUUID(),reason:'Must require login'},403);
 await request('/api/veto/admin/override','POST',head,{...credentials,operation:'reset',reason:'Authorized Head Ref reset'});
 assert.ifError((await db.from('event_admins').delete().eq('event_id',event).eq('user_id',head.id)).error);await session('admin',head,403);
 // Password-protected team links retain their own gate without staff login.
 const {hashPassword}=await import('../src/lib/auth/teamPassword.ts');assert.ifError((await db.from('match_team_passwords').insert({match_id:id,password_hash:await hashPassword('a'),team_b_password_hash:await hashPassword('b')})).error);
 assert.equal((await session('team_a',null,401)).password_required,true);await session('observer',null);
 console.log('PASS staff login HTTP: anonymous redirects/401 without match leaks, unrelated/referee escalation denied, owner/Head Ref/Vanguard permissions, Referee view caps, team/observer behavior, all action endpoints, revoked event access including match creator');
}finally{
 for(const id of matches)assert.ifError((await db.from('matches').delete().eq('id',id)).error);
 for(const id of events)assert.ifError((await db.from('events').delete().eq('id',id)).error);
 for(const id of users)assert.ifError((await db.auth.admin.deleteUser(id)).error);
 console.log('Cleaned up disposable staff login fixtures');
}
