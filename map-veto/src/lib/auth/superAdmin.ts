import {randomBytes} from 'node:crypto';
import {NextResponse} from 'next/server';
import type {User} from '@supabase/supabase-js';
import {createClient} from '@/lib/supabase/server';
import {isSuperAdmin} from './superAdminRole';
export {isSuperAdmin,SUPER_ADMIN_EMAIL} from './superAdminRole';

export async function requireSuperAdmin():Promise<{user:User;error?:never}|{user?:never;error:NextResponse}> {
 const {data:{user}}=await (await createClient()).auth.getUser();
 if(!user)return {error:NextResponse.json({error:'Unauthorized'},{status:401})};
 if(!isSuperAdmin(user))return {error:NextResponse.json({error:'Super admin access required'},{status:403})};
 return {user};
}
// 18 random bytes → 24 URL-safe characters; shown once to the super admin.
export const generatePassword=()=>randomBytes(18).toString('base64url');
