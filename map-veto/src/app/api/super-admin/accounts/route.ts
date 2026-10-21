import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {createServiceClient} from '@/lib/supabase/server';
import {requireSuperAdmin,isSuperAdmin,generatePassword} from '@/lib/auth/superAdmin';

const CreateSchema=z.object({email:z.string().trim().toLowerCase().email(),password:z.string().min(10,'Password must be at least 10 characters').max(72).optional().or(z.literal('').transform(()=>undefined)),event_id:z.string().uuid().optional().or(z.literal('').transform(()=>undefined)),role:z.enum(['admin','referee']).default('admin')});
const ResetSchema=z.object({user_id:z.string().uuid(),action:z.literal('reset_password')});

// GET: every platform account with its tournament roles, plus the tournaments it can be added to.
export async function GET() {
 const auth=await requireSuperAdmin();if(auth.error)return auth.error;
 const db=createServiceClient(),users=[];
 for(let page=1;;page++){const {data,error}=await db.auth.admin.listUsers({page,perPage:1000});if(error)return NextResponse.json({error:'Failed to list accounts'},{status:500});users.push(...data.users);if(data.users.length<1000)break;}
 const [{data:events,error:eventsError},{data:staff,error:staffError}]=await Promise.all([db.from('events').select('id,name,created_by').order('created_at',{ascending:false}),db.from('event_admins').select('id,event_id,user_id,role')]);
 if(eventsError || staffError)return NextResponse.json({error:'Failed to load tournaments'},{status:500});
 const accounts=users.map(u=>({id:u.id,email:u.email||'',created_at:u.created_at,last_sign_in_at:u.last_sign_in_at||null,super_admin:isSuperAdmin(u),
  tournaments:[...(events||[]).filter(e=>e.created_by===u.id).map(e=>({membership_id:null,event_id:e.id,role:'owner'})),...(staff||[]).filter(s=>s.user_id===u.id).map(s=>({membership_id:s.id,event_id:s.event_id,role:s.role}))]}))
  .sort((a,b)=>Number(b.super_admin)-Number(a.super_admin) || a.email.localeCompare(b.email));
 return NextResponse.json({accounts,events:(events||[]).map(e=>({id:e.id,name:e.name}))});
}

// POST: create an account (confirmed, so it can sign in immediately) and optionally add it to a tournament.
export async function POST(request:NextRequest) {
 const auth=await requireSuperAdmin();if(auth.error)return auth.error;
 const parsed=CreateSchema.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return NextResponse.json({error:parsed.error.issues[0].message},{status:400});
 const {email,event_id,role}=parsed.data,password=parsed.data.password || generatePassword(),db=createServiceClient();
 if(event_id){const {data:event}=await db.from('events').select('id').eq('id',event_id).maybeSingle();if(!event)return NextResponse.json({error:'Tournament not found'},{status:404});}
 const {data:{user},error}=await db.auth.admin.createUser({email,password,email_confirm:true});
 if(error || !user)return NextResponse.json({error:/already|exists|registered/i.test(error?.message||'')?'An account with that email already exists':'Failed to create account'},{status:/already|exists|registered/i.test(error?.message||'')?409:500});
 if(event_id){const {error:staffError}=await db.from('event_admins').insert({event_id,user_id:user.id,role,added_by:auth.user.id});if(staffError)return NextResponse.json({error:'Account created, but adding it to the tournament failed. Add it from the account list.',account_id:user.id,password:parsed.data.password?undefined:password},{status:500});}
 return NextResponse.json({account:{id:user.id,email:user.email},password:parsed.data.password?undefined:password},{status:201});
}

// PATCH: replace an account's password with a newly generated one (returned once).
export async function PATCH(request:NextRequest) {
 const auth=await requireSuperAdmin();if(auth.error)return auth.error;
 const parsed=ResetSchema.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return NextResponse.json({error:'Invalid request'},{status:400});
 const password=generatePassword(),{error}=await createServiceClient().auth.admin.updateUserById(parsed.data.user_id,{password});
 if(error)return NextResponse.json({error:'Failed to reset password'},{status:error.status===404?404:500});
 return NextResponse.json({password});
}
