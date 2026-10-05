import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {createServiceClient} from '@/lib/supabase/server';
import {matchStaffAccess} from '@/lib/auth/matchAdmin';
import {vetoResponse} from '@/lib/veto/respond';
const schema=z.discriminatedUnion('operation',[
 z.object({operation:z.literal('request'),match_id:z.string().uuid(),token:z.string().uuid().optional(),request_id:z.string().uuid(),reason:z.string().trim().min(1).max(500)}),
 z.object({operation:z.literal('answer'),match_id:z.string().uuid(),token:z.string().uuid(),request_id:z.string().uuid(),approve:z.boolean()})
]);
export async function POST(request:NextRequest) {
 const input=schema.safeParse(await request.json().catch(()=>null));
 if(!input.success)return NextResponse.json({error:'Invalid reset request'},{status:400});
 const d=input.data,db=createServiceClient();
 let token=d.token;
 if(d.operation==='request') {
  const access=await matchStaffAccess(d.match_id,token);
  if(access?.role!=='referee')return NextResponse.json({error:'Referee access required'},{status:403});
  token=access.token;
 } else {
  const {data:link}=await db.from('match_links').select('link_type,expires_at').eq('match_id',d.match_id).eq('token',token!).single();
  if(!link || !['team_a','team_b'].includes(link.link_type) || (link.expires_at && Date.parse(link.expires_at)<=Date.now()))return NextResponse.json({error:'Valid team link required'},{status:403});
 }
 const args=d.operation==='request'?{p_match_id:d.match_id,p_token:token!,p_request_id:d.request_id,p_reason:d.reason}:{p_match_id:d.match_id,p_token:token!,p_request_id:d.request_id,p_approve:d.approve};
 const {data,error}=await db.rpc(d.operation==='request'?'veto_request_reset':'veto_answer_reset',args);
 if(error)return NextResponse.json({error:error.message},{status:409});
 const [match,state]=await Promise.all([db.from('matches').select('*').eq('id',d.match_id).single(),db.from('match_state').select('*').eq('match_id',d.match_id).single()]);
 if(match.error || state.error)return NextResponse.json({error:'Could not refresh the match. Reload to see the reset request.'},{status:500});
 const result={request:data,match:match.data,new_state:state.data};
 return vetoResponse(d.match_id,result);
}
