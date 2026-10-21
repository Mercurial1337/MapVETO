// Creates or updates the single super admin account (superadmin@vg.com) and makes it the only one.
// Usage: NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… [SUPER_ADMIN_PASSWORD=…] node scripts/create-super-admin.mjs
// Without SUPER_ADMIN_PASSWORD a new password is generated for a new account and printed once;
// an existing account keeps its password unless SUPER_ADMIN_PASSWORD is given.
import {randomBytes} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
const email='superadmin@vg.com',url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!url || !key){console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');process.exit(1);}
const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}),users=[];
for(let page=1;;page++){const {data,error}=await db.auth.admin.listUsers({page,perPage:1000});if(error)throw error;users.push(...data.users);if(data.users.length<1000)break;}
const given=process.env.SUPER_ADMIN_PASSWORD;let account=users.find(u=>u.email?.toLowerCase()===email),password=given;
if(account){const {error}=await db.auth.admin.updateUserById(account.id,{app_metadata:{...account.app_metadata,role:'super_admin'},email_confirm:true,...(given?{password:given}:{})});if(error)throw error;}
else{password=given || randomBytes(18).toString('base64url');const {data,error}=await db.auth.admin.createUser({email,password,email_confirm:true,app_metadata:{role:'super_admin'}});if(error)throw error;account=data.user;}
for(const other of users.filter(u=>u.id!==account.id && u.app_metadata?.role==='super_admin')){const {error}=await db.auth.admin.updateUserById(other.id,{app_metadata:{...other.app_metadata,role:null}});if(error)throw error;console.log('Removed super admin from',other.email);}
console.log(`Super admin ready: ${email}`);
if(password && !given)console.log(`Password (shown once, store it now): ${password}`);
