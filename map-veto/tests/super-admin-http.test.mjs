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
 // Only the super admin reaches the account APIs; event owners do not.
 await call('/api/super-admin/accounts','GET',null,'',401);
 await call('/api/super-admin/accounts','GET',null,ownerCookie,403);
 await call('/api/super-admin/accounts','POST',{email:'x@example.invalid'},ownerCookie,403);
 await call('/api/super-admin/memberships','POST',{user_id:owner.id,event_id:event,role:'admin'},ownerCookie,403);
 const page=await (await fetch(base+'/admin/accounts',{headers:{Cookie:ownerCookie}})).status;assert.equal(page,200);
 // Create an account directly on a tournament; the generated password signs in immediately.
 const email=`codex-staff-${randomUUID().slice(0,8)}@example.invalid`;
 await call('/api/super-admin/accounts','POST',{email,password:'short'},superCookie,400);
 await call('/api/super-admin/accounts','POST',{email,event_id:randomUUID()},superCookie,404);
 const created=await call('/api/super-admin/accounts','POST',{email:email.toUpperCase(),event_id:event,role:'referee'},superCookie,201);users.push(created.account.id);
 assert.equal(created.account.email,email);assert.match(created.password,/^[\w-]{24}$/);
 assert.ok(await signIn(email,created.password));
 await call('/api/super-admin/accounts','POST',{email},superCookie,409);
 const chosen=`codex-chosen-${randomUUID().slice(0,8)}@example.invalid`;
 const withPassword=await call('/api/super-admin/accounts','POST',{email:chosen,password:'Chosen!0042xyz'},superCookie,201);users.push(withPassword.account.id);
 assert.equal(withPassword.password,undefined);assert.ok(await signIn(chosen,'Chosen!0042xyz'));
 let list=await call('/api/super-admin/accounts','GET',null,superCookie,200);
 const find=id=>list.accounts.find(a=>a.id===id);
 assert.ok(list.events.some(e=>e.id===event));assert.equal(list.accounts[0].email,'superadmin@vg.com');assert.equal(list.accounts[0].super_admin,true);
 assert.deepEqual(find(created.account.id).tournaments.map(t=>[t.event_id,t.role]),[[event,'referee']]);
 assert.deepEqual(find(owner.id).tournaments.map(t=>[t.event_id,t.role,t.membership_id]),[[event,'owner',null]]);
 assert.ok(!JSON.stringify(list).includes(created.password));
 // Adding again changes the role; the owner cannot be added to their own tournament.
 const membership=(await call('/api/super-admin/memberships','POST',{user_id:created.account.id,event_id:event,role:'admin'},superCookie,201)).membership;
 assert.equal(membership.role,'admin');
 const {data:rows}=await db.from('event_admins').select('role').eq('event_id',event).eq('user_id',created.account.id);assert.deepEqual(rows,[{role:'admin'}]);
 await call('/api/super-admin/memberships','POST',{user_id:owner.id,event_id:event,role:'admin'},superCookie,400);
 await call('/api/super-admin/memberships','POST',{user_id:randomUUID(),event_id:event,role:'admin'},superCookie,404);
 await call('/api/super-admin/memberships','POST',{user_id:withPassword.account.id,event_id:event,role:'owner'},superCookie,400);
 // The new Head Admin now has the tournament's staff access.
 const staffCookie=await signIn(email,created.password);
 assert.ok(![401,403].includes((await fetch(`${base}/api/events/${event}/sheet`,{headers:{Cookie:staffCookie}})).status));
 // Password reset replaces the old password.
 const reset=await call('/api/super-admin/accounts','PATCH',{user_id:created.account.id,action:'reset_password'},superCookie,200);
 assert.equal(await signIn(email,created.password),null);assert.ok(await signIn(email,reset.password));
 await call('/api/super-admin/accounts','PATCH',{user_id:created.account.id,action:'reset_password'},ownerCookie,403);
 // Removal.
 await call(`/api/super-admin/memberships?id=${membership.id}`,'DELETE',null,ownerCookie,403);
 await call(`/api/super-admin/memberships?id=${membership.id}`,'DELETE',null,superCookie,200);
 await call(`/api/super-admin/memberships?id=${membership.id}`,'DELETE',null,superCookie,404);
 list=await call('/api/super-admin/accounts','GET',null,superCookie,200);assert.deepEqual(find(created.account.id).tournaments,[]);
 console.log('PASS super admin HTTP: account APIs denied to signed-out users and event owners, account creation with generated or chosen password signs in, direct tournament assignment, role change, owner/unknown rejected, staff access granted, password reset revokes old password, removal');
} finally {
 if(events.length)await db.from('events').delete().in('id',events);
 for(const id of users)await db.auth.admin.deleteUser(id);
}
