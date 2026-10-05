import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { z } from 'zod';
import {matchStaffAccess} from '@/lib/auth/matchAdmin';
const schema=z.object({match_id:z.string().uuid(),token:z.string().uuid()});
export async function POST(request:NextRequest) {
 const input=schema.safeParse(await request.json().catch(()=>null));
 if(!input.success) return NextResponse.json({error:'Invalid match link'},{status:401});
 const {match_id,token}=input.data,db=createServiceClient();
 const {data:link}=await db.from('match_links').select('link_type,expires_at').eq('match_id',match_id).eq('token',token).single();
 if(!link || (link.expires_at && Date.parse(link.expires_at)<=Date.now())) return NextResponse.json({error:'Invalid or expired match link'},{status:401});
 const [match,logs,reset,staff]=await Promise.all([
  db.from('matches').select('*,match_state(*),veto_templates(id,name,format,sequence,game_id),events(logo_url,coin_image_url,custom_font_url,custom_font_name)').eq('id',match_id).single(),
  db.from('match_logs').select('*').eq('match_id',match_id).order('log_order',{ascending:true}),
  db.from('veto_reset_requests').select('id,match_id,reason,status,team_a_approved_at,team_b_approved_at,created_at,resolved_at').eq('match_id',match_id).eq('status','pending').maybeSingle(),
  matchStaffAccess(match_id,token)
 ]);
 if(match.error || logs.error || reset.error) return NextResponse.json({error:'Could not load match'},{status:500});
 return NextResponse.json({match:{...match.data,can_admin:staff?.role==='admin',can_referee:staff?.role==='referee',reset_request:reset.data},state:Array.isArray(match.data.match_state)?match.data.match_state[0]:match.data.match_state,logs:logs.data,userRole:link.link_type,eventBranding:match.data.events},{headers:{'Cache-Control':'no-store'}});
}
