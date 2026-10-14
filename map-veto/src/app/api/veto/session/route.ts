import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { z } from 'zod';
import {matchStaffAccess} from '@/lib/auth/matchAdmin';
import {teamGate} from '@/lib/auth/teamAccess';
const schema=z.object({match_id:z.string().uuid(),token:z.string().uuid()});
export async function POST(request:NextRequest) {
 const started=performance.now();
 const input=schema.safeParse(await request.json().catch(()=>null));
 if(!input.success) return NextResponse.json({error:'Invalid match link'},{status:401});
 const {match_id,token}=input.data,db=createServiceClient();
 let sampled=started;
 const [gate,snapshot,staff]=await Promise.all([
  teamGate(match_id,token),
  db.rpc('veto_session_snapshot',{p_match_id:match_id,p_token:token}).then(result=>{sampled=performance.now();return result;}),
  matchStaffAccess(match_id,token)
 ]);
 if(gate)return gate;
 if(snapshot.error)return NextResponse.json({error:'Could not load match'},{status:500});
 const data=snapshot.data;
 if(!data)return NextResponse.json({error:'Invalid or expired match link'},{status:401});
 // Only staff learn who acknowledged a timeout; the shared audit log records the role alone.
 let timeout_acknowledgments:Record<string,{at:string;by:string;role:string}>|undefined;
 if(staff){const {data:acks}=await db.from('veto_timeout_requests').select('id,acknowledged_at,acknowledged_label,acknowledged_role').eq('match_id',match_id).not('acknowledged_at','is',null);timeout_acknowledgments=Object.fromEntries((acks||[]).map(ack=>[ack.id,{at:ack.acknowledged_at,by:ack.acknowledged_label,role:ack.acknowledged_role}]));}
 const finished=performance.now();
 return NextResponse.json({...data,match:{...data.match,can_admin:staff?.role==='admin',can_referee:staff?.role==='referee',reset_request:data.reset_request,timeout_acknowledgments},server_time:Number(data.server_time)+finished-sampled,server_processing_ms:finished-started},{headers:{'Cache-Control':'no-store'}});
}
