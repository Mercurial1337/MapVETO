import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {createServiceClient} from '@/lib/supabase/server';
import {requireSuperAdmin} from '@/lib/auth/superAdmin';

const AddSchema=z.object({user_id:z.string().uuid(),event_id:z.string().uuid(),role:z.enum(['admin','referee'])});

// POST: add an account to a tournament as Head Admin or Referee; an existing membership changes role.
export async function POST(request:NextRequest) {
 const auth=await requireSuperAdmin();if(auth.error)return auth.error;
 const parsed=AddSchema.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return NextResponse.json({error:'Choose an account, a tournament and a role'},{status:400});
 const {user_id,event_id,role}=parsed.data,db=createServiceClient();
 const [{data:event},{data:{user}}]=await Promise.all([db.from('events').select('id,created_by').eq('id',event_id).maybeSingle(),db.auth.admin.getUserById(user_id)]);
 if(!event)return NextResponse.json({error:'Tournament not found'},{status:404});
 if(!user)return NextResponse.json({error:'Account not found'},{status:404});
 if(event.created_by===user_id)return NextResponse.json({error:'This account owns the tournament and already has full access'},{status:400});
 const {data,error}=await db.from('event_admins').upsert({event_id,user_id,role,added_by:auth.user.id},{onConflict:'event_id,user_id'}).select('id,event_id,user_id,role').single();
 if(error)return NextResponse.json({error:'Failed to add account to tournament'},{status:500});
 return NextResponse.json({membership:data},{status:201});
}

// DELETE ?id=<membership>: remove an account from a tournament.
export async function DELETE(request:NextRequest) {
 const auth=await requireSuperAdmin();if(auth.error)return auth.error;
 const id=z.string().uuid().safeParse(request.nextUrl.searchParams.get('id'));
 if(!id.success)return NextResponse.json({error:'id query parameter is required'},{status:400});
 const {data,error}=await createServiceClient().from('event_admins').delete().eq('id',id.data).select('id');
 if(error)return NextResponse.json({error:'Failed to remove account from tournament'},{status:500});
 if(!data?.length)return NextResponse.json({error:'Membership not found'},{status:404});
 return NextResponse.json({success:true});
}
