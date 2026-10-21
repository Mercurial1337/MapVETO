import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {createServiceClient} from '@/lib/supabase/server';
import {requireSuperAdmin,generatePassword} from '@/lib/auth/superAdmin';

const CreateSchema=z.object({email:z.string().trim().toLowerCase().email(),password:z.string().min(10,'Password must be at least 10 characters').max(72).optional().or(z.literal('').transform(()=>undefined))});

// POST: create an account (confirmed, so it can sign in immediately). This is the super admin's only
// capability: it cannot list accounts or tournaments; owners add staff from the event page as usual.
export async function POST(request:NextRequest) {
 const auth=await requireSuperAdmin();if(auth.error)return auth.error;
 const parsed=CreateSchema.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return NextResponse.json({error:parsed.error.issues[0].message},{status:400});
 const {email}=parsed.data,password=parsed.data.password || generatePassword();
 const {data:{user},error}=await createServiceClient().auth.admin.createUser({email,password,email_confirm:true});
 const exists=/already|exists|registered/i.test(error?.message||'');
 if(error || !user)return NextResponse.json({error:exists?'An account with that email already exists':'Failed to create account'},{status:exists?409:500});
 return NextResponse.json({account:{email:user.email},password:parsed.data.password?undefined:password},{status:201});
}
