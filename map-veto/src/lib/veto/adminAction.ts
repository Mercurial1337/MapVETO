import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';
import { matchAdminToken } from '@/lib/auth/matchAdmin';
import { vetoResponse } from '@/lib/veto/respond';
const schema=z.object({match_id:z.string().uuid(),token:z.string().uuid().optional(),operation:z.enum(['pause','resume','restart','undo','correct','force','reset','reopen_step']),target_step:z.number().int().min(0).optional(),current_step:z.number().int().min(0).optional(),request_id:z.string().uuid().optional(),map_id:z.string().uuid().optional(),side:z.enum(['attack','defense']).optional(),reason:z.string().trim().min(1).max(500),turn_started_at:z.string().datetime({offset:true}).optional()});
export async function adminAction(request:NextRequest, operation?:string) {
 const body=await request.json().catch(()=>null);
 const input=schema.safeParse(body && {...body,operation:operation || body.operation});
 if(!input.success) return NextResponse.json({error:'Invalid admin action; include a reason and the selection to override'},{status:400});
 const d=input.data,admin=await matchAdminToken(d.match_id,d.token);
 if(!admin) return NextResponse.json({error:'Match administrator required'},{status:403});
 if(d.operation==='reopen_step' && (d.target_step===undefined || d.current_step===undefined || !d.request_id || !d.turn_started_at)) return NextResponse.json({error:'Include the target step and current veto state'},{status:400});
 const {data,error}=d.operation==='reopen_step'
  ? await createServiceClient().rpc('veto_reopen_step',{p_match_id:d.match_id,p_token:admin,p_step:d.target_step!,p_reason:d.reason,p_expected:d.turn_started_at!,p_current_step:d.current_step!,p_request_id:d.request_id!})
  : await createServiceClient().rpc('veto_admin',{p_match_id:d.match_id,p_token:admin,p_operation:d.operation,p_map_id:d.map_id || null,p_side:d.side || null,p_reason:d.reason,p_expected:d.turn_started_at || null});
 if(error) return NextResponse.json({error:error.message},{status:409});
 return vetoResponse(d.match_id,data);
}
