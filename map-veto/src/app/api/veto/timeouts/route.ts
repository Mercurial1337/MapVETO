import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';
import { matchAdminToken } from '@/lib/auth/matchAdmin';
import { vetoResponse } from '@/lib/veto/respond';
const common={match_id:z.string().uuid(),token:z.string().uuid(),request_id:z.string().uuid()};
const schema=z.discriminatedUnion('operation',[
 z.object({...common,operation:z.literal('request'),reason:z.string().trim().min(1).max(1000)}),
 z.object({...common,operation:z.literal('resolve'),resolution:z.string().trim().min(1).max(1000)}),
]);
export async function POST(request:NextRequest) {
 const input=schema.safeParse(await request.json().catch(()=>null));
 if(!input.success) return NextResponse.json({error:'Include the timeout request and a description (maximum 1000 characters).'},{status:400});
 const d=input.data,db=createServiceClient();
 let token=d.token;
 if(d.operation==='resolve') {
  const admin=await matchAdminToken(d.match_id,token);
  if(!admin) return NextResponse.json({error:'Match administrator required'},{status:403});
  token=admin;
 } else {
  const {data:link}=await db.from('match_links').select('link_type,expires_at').eq('match_id',d.match_id).eq('token',token).single();
  if(!link || !['team_a','team_b'].includes(link.link_type) || (link.expires_at && Date.parse(link.expires_at)<=Date.now())) return NextResponse.json({error:'Valid team link required'},{status:403});
 }
 const {data,error}=d.operation==='request'
  ? await db.rpc('veto_request_timeout',{p_match_id:d.match_id,p_token:token,p_reason:d.reason,p_request_id:d.request_id})
  : await db.rpc('veto_resolve_timeout',{p_match_id:d.match_id,p_token:token,p_request_id:d.request_id,p_resolution:d.resolution});
 if(error) return NextResponse.json({error:error.message},{status:409});
 return vetoResponse(d.match_id,data);
}
