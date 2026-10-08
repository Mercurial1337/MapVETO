import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { z } from 'zod';
import {matchStaffAccess} from '@/lib/auth/matchAdmin';
const schema=z.object({match_id:z.string().uuid(),token:z.string().uuid()});
export async function POST(request:NextRequest) {
 const started=performance.now();
 const input=schema.safeParse(await request.json().catch(()=>null));
 if(!input.success) return NextResponse.json({error:'Invalid match link'},{status:401});
 const {match_id,token}=input.data,db=createServiceClient();
 let sampled=started;
 const [snapshot,staff]=await Promise.all([
  db.rpc('veto_session_snapshot',{p_match_id:match_id,p_token:token}).then(result=>{sampled=performance.now();return result;}),
  matchStaffAccess(match_id,token)
 ]);
 if(snapshot.error)return NextResponse.json({error:'Could not load match'},{status:500});
 const data=snapshot.data;
 if(!data)return NextResponse.json({error:'Invalid or expired match link'},{status:401});
 const finished=performance.now();
 return NextResponse.json({...data,match:{...data.match,can_admin:staff?.role==='admin',can_referee:staff?.role==='referee',reset_request:data.reset_request},server_time:Number(data.server_time)+finished-sampled,server_processing_ms:finished-started},{headers:{'Cache-Control':'no-store'}});
}
