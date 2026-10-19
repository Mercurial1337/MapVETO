import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {createServerClient} from '@supabase/ssr';
import {hashPassword} from '../src/lib/auth/teamPassword.ts';
import {matchLinkUrls} from '../src/lib/clipboard.ts';
process.loadEnvFile('.env.local');
// Run against the app at TEST_APP_URL with the matching database environment.
const opts={auth:{persistSession:false,autoRefreshToken:false}};
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,opts);
const base=process.env.TEST_APP_URL || 'http://localhost:3001',users=[],eventId=randomUUID(),matchId=randomUUID();
async function session() {
 const email=`referee-links-${randomUUID()}@example.invalid`,password=randomUUID()+'aA!';
 const {data,error}=await db.auth.admin.createUser({email,password,email_confirm:true});assert.ifError(error);users.push(data.user.id);
 const jar=new Map();
 const client=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{...opts,cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:items=>items.forEach(({name,value})=>jar.set(name,value))}});
 assert.ifError((await client.auth.signInWithPassword({email,password})).error);
 return {id:data.user.id,cookie:[...jar].map(([name,value])=>`${name}=${value}`).join('; ')};
}
async function post(path,body,cookie,status) {
 const response=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(body)});
 const data=await response.json();assert.equal(response.status,status,JSON.stringify(data));
 return {data,cookie:(response.headers.getSetCookie?.() || []).map(value=>value.split(';')[0]).join('; ')};
}
try {
 const owner=await session(),referee=await session(),outsider=await session();
 assert.ifError((await db.from('events').insert({id:eventId,name:'Codex Referee Links QA',created_by:owner.id})).error);
 assert.ifError((await db.from('event_admins').insert({event_id:eventId,user_id:referee.id,role:'referee',added_by:owner.id})).error);
 const {data:template,error}=await db.from('veto_templates').select('id').eq('format','bo3').eq('is_default',true).single();assert.ifError(error);
 assert.ifError((await db.from('matches').insert({id:matchId,event_id:eventId,created_by:owner.id,veto_template_id:template.id,team_a_name:'Codex Referee Alpha',team_b_name:'Codex Referee Beta',format:'bo3',status:'ready_check'})).error);
 assert.ifError((await db.from('match_team_passwords').insert({match_id:matchId,password_hash:await hashPassword('Alpha!0042'),team_b_password_hash:await hashPassword('Beta!0042')})).error);
 const path=`/api/matches/${matchId}`;
 await post(path,{},'',403);await post(path,{},outsider.cookie,403);
 const all=(await post(path,{},owner.cookie,200)).data;
 assert.deepEqual(Object.keys(all.links).sort(),['admin','observer','referee','team_a','team_b']);
 const result=(await post(path,{},referee.cookie,200)).data;
 assert.equal(result.staff_role,'referee');
 assert.deepEqual(Object.keys(result.links).sort(),['referee','team_a','team_b']);
 assert.ok(!JSON.stringify(result).includes(all.links.admin.token));
 const urls=matchLinkUrls(result.links,base,matchId,['team_a','team_b','referee']);
 for(const role of ['team_a','team_b']) {
  assert.equal(new URL(urls[role]).searchParams.get('token'),all.links[role].token);
  const credentials={match_id:matchId,token:result.links[role].token};
  const locked=(await post('/api/veto/session',credentials,referee.cookie,401)).data;
  assert.equal(locked.password_required,true);assert.equal(locked.match,undefined);
  const page=await (await fetch(urls[role],{headers:{Cookie:referee.cookie}})).text();
  assert.ok(page.includes('Team password'));assert.ok(!page.includes('Codex Referee Alpha'));
  const wrong=role==='team_a'?'Beta!0042':'Alpha!0042',correct=role==='team_a'?'Alpha!0042':'Beta!0042';
  await post('/api/veto/access',{...credentials,password:wrong},referee.cookie,401);
  const unlocked=await post('/api/veto/access',{...credentials,password:correct},referee.cookie,200);
  const cookie=referee.cookie+'; '+unlocked.cookie;
  const snapshot=(await post('/api/veto/session',credentials,cookie,200)).data;
  assert.equal(snapshot.userRole,role);assert.equal(snapshot.match.can_admin,false);
  assert.equal(snapshot.match.can_referee,false);
  const other=role==='team_a'?'team_b':'team_a';
  assert.equal((await post('/api/veto/session',{match_id:matchId,token:result.links[other].token},cookie,401)).data.password_required,true);
 }
 // Observer links remain read-only even for a creator/owner signed in to the app.
 const observer={match_id:matchId,token:all.links.observer.token};
 for(const user of [owner,referee]) {
  const snapshot=(await post('/api/veto/session',observer,user.cookie,200)).data;
  assert.equal(snapshot.userRole,'observer');
  assert.equal(snapshot.match.can_admin,false);assert.equal(snapshot.match.can_referee,false);
  const page=await (await fetch(`${base}/match/${matchId}?token=${observer.token}`,{headers:{Cookie:user.cookie}})).text();
  assert.ok(!page.includes('Head Admin override controls'));assert.ok(!page.includes('Request veto reset'));
  for(const token of [observer.token,result.links.referee.token,randomUUID()]) {
   await post('/api/veto/admin/override',{match_id:matchId,token,operation:'pause',reason:'Observer must stay read-only'},user.cookie,403);
  }
 }
 // A referee creating a standalone match is its owner, but its observer link
 // still must not inherit that creator's Head Admin access.
 assert.ifError((await db.from('matches').update({event_id:null,created_by:referee.id}).eq('id',matchId)).error);
 const creatorView=(await post('/api/veto/session',observer,referee.cookie,200)).data;
 assert.equal(creatorView.match.can_admin,false);assert.equal(creatorView.match.can_referee,false);
 await post('/api/veto/admin/override',{...observer,operation:'pause',reason:'Creator observer must stay read-only'},referee.cookie,403);
 for(const [role,cookie] of [['admin',owner.cookie],['referee',referee.cookie]]) {
  const staffView=(await post('/api/veto/session',{match_id:matchId,token:all.links[role].token},cookie,200)).data;
  assert.equal(staffView.match.can_admin,role==='admin');assert.equal(staffView.match.can_referee,role==='referee');
 }
 await post('/api/veto/admin/override',{match_id:matchId,token:result.links.referee.token,operation:'pause',reason:'Must not elevate'},referee.cookie,403);
 console.log('PASS referee links: scoped link sharing, team passwords, observer/team links never inherit staff controls, creator observer remains read-only, explicit staff links retain their roles and cannot be upgraded');
} finally {
 assert.ifError((await db.from('matches').delete().eq('id',matchId)).error);
 assert.ifError((await db.from('events').delete().eq('id',eventId)).error);
 for(const id of users)assert.ifError((await db.auth.admin.deleteUser(id)).error);
}
