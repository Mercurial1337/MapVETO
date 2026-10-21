import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
process.loadEnvFile('.env.local');
// Requires the app at TEST_APP_URL (default http://127.0.0.1:3001) and the super admin created by
// scripts/create-super-admin.mjs; pass its password as SUPER_ADMIN_PASSWORD.
const url=process.env.NEXT_PUBLIC_SUPABASE_URL,base=process.env.TEST_APP_URL || 'http://127.0.0.1:3001';
const db=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}}),users=[],events=[];
assert.ok(process.env.SUPER_ADMIN_PASSWORD,'SUPER_ADMIN_PASSWORD is required');
// Browser-equivalent session cookie (@supabase/ssr format) from a real password sign-in.
async function signIn(email,password) {
 const client=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false}});
 const {data,error}=await client.auth.signInWithPassword({email,password});if(error)return null;
 return `sb-${new URL(url).hostname.split('.')[0]}-auth-token=base64-${Buffer.from(JSON.stringify(data.session)).toString('base64url')}`;
}
async function call(path,method,body,cookie,expected) {
 const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',Cookie:cookie||''},body:body?JSON.stringify(body):undefined});
 const data=await response.json();assert.equal(response.status,expected,`${method} ${path}: ${JSON.stringify(data)}`);return data;
}
try {
 const ownerEmail=`codex-owner-${randomUUID().slice(0,8)}@example.invalid`,ownerPassword='Owner!'+randomUUID();
 const {data:{user:owner}}=await db.auth.admin.createUser({email:ownerEmail,password:ownerPassword,email_confirm:true});users.push(owner.id);
 const event=randomUUID();events.push(event);
 assert.ifError((await db.from('events').insert({id:event,name:'Codex Super Admin Tournament',created_by:owner.id})).error);
 const ownerCookie=await signIn(ownerEmail,ownerPassword),superCookie=await signIn('superadmin@vg.com',process.env.SUPER_ADMIN_PASSWORD);
 assert.ok(ownerCookie && superCookie);
 // Account creation is the super admin's only capability; it cannot list accounts or tournaments
 // or assign staff, and other accounts cannot create accounts at all.
 await call('/api/super-admin/accounts','POST',{email:'x@example.invalid'},'',401);
 await call('/api/super-admin/accounts','POST',{email:'x@example.invalid'},ownerCookie,403);
 for(const method of ['GET','PATCH','DELETE'])assert.equal((await fetch(base+'/api/super-admin/accounts',{method,headers:{Cookie:superCookie}})).status,405,method);
 assert.equal((await fetch(base+'/api/super-admin/memberships',{method:'POST',headers:{'Content-Type':'application/json',Cookie:superCookie},body:'{}'})).status,404);
 const page=await (await fetch(base+'/admin/accounts',{headers:{Cookie:ownerCookie}})).status;assert.equal(page,200);
 // A generated password signs in immediately; a chosen password is never echoed back.
 const email=`codex-staff-${randomUUID().slice(0,8)}@example.invalid`;
 await call('/api/super-admin/accounts','POST',{email,password:'short'},superCookie,400);
 const created=await call('/api/super-admin/accounts','POST',{email:email.toUpperCase(),event_id:event,role:'admin'},superCookie,201);
 const {data:{users:all}}=await db.auth.admin.listUsers({page:1,perPage:1000});const createdUser=all.find(u=>u.email===email);users.push(createdUser.id);
 assert.deepEqual(Object.keys(created.account),['email']);assert.equal(created.account.email,email);assert.match(created.password,/^[\w-]{24}$/);
 assert.ok(await signIn(email,created.password));
 await call('/api/super-admin/accounts','POST',{email},superCookie,409);
 // Extra fields are ignored: the new account is not placed on any tournament.
 const {data:memberships}=await db.from('event_admins').select('id').eq('user_id',createdUser.id);assert.deepEqual(memberships,[]);
 const chosen=`codex-chosen-${randomUUID().slice(0,8)}@example.invalid`;
 const withPassword=await call('/api/super-admin/accounts','POST',{email:chosen,password:'Chosen!0042xyz'},superCookie,201);
 users.push((await db.auth.admin.listUsers({page:1,perPage:1000})).data.users.find(u=>u.email===chosen).id);
 assert.equal(withPassword.password,undefined);assert.ok(await signIn(chosen,'Chosen!0042xyz'));
 // Everything other than account creation is closed to the super admin, in pages and APIs.
 for(const path of ['/admin','/admin/matches','/admin/events','/admin/matches/new','/admin/events/new',`/admin/events/${event}/edit`,'/']) {
  const response=await fetch(base+path,{redirect:'manual',headers:{Cookie:superCookie}});
  assert.equal(response.status,307,path);assert.equal(new URL(response.headers.get('location'),base).pathname,'/admin/accounts',path);
 }
 assert.equal((await fetch(base+'/admin/accounts',{redirect:'manual',headers:{Cookie:superCookie}})).status,200);
 for(const [path,method,body] of [['/api/events','GET'],['/api/events','POST',{name:'Blocked'}],['/api/matches','POST',{team_a_name:'A',team_b_name:'B',format:'bo1'}],['/api/admin/notifications','GET'],
  [`/api/events/${event}`,'GET'],[`/api/events/${event}/admins`,'POST',{email,role:'admin'}],[`/api/events/${event}/teams`,'GET'],[`/api/events/${event}/sheet`,'GET'],[`/api/events/${event}/bulk-matches`,'POST',{}],[`/api/events/${event}/analytics`,'GET']]) {
  const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',Cookie:superCookie},body:body?JSON.stringify(body):undefined});
  assert.equal(response.status,403,`${method} ${path}`);
 }
 const {count:superEvents}=await db.from('events').select('id',{count:'exact',head:true}).eq('name','Blocked');assert.equal(superEvents,0);
 // Ordinary accounts are unaffected.
 assert.equal((await fetch(base+'/api/events',{headers:{Cookie:ownerCookie}})).status,200);
 assert.equal((await fetch(base+'/admin',{redirect:'manual',headers:{Cookie:ownerCookie}})).status,200);
 // The tournament owner adds the new account from the event page as usual.
 const ownerAdd=await call(`/api/events/${event}/admins`,'POST',{email,role:'referee'},ownerCookie,201);assert.equal(ownerAdd.admin.role,'referee');
 console.log('PASS super admin HTTP: only the super admin can create accounts, every other admin page redirects it to Accounts and every staff API returns 403 to it while owners are unaffected, no listing/assignment/reset endpoints, generated or chosen password signs in immediately, new accounts start without tournaments, owners add them from the event page');
} finally {
 if(events.length)await db.from('events').delete().in('id',events);
 for(const id of users)await db.auth.admin.deleteUser(id);
}
