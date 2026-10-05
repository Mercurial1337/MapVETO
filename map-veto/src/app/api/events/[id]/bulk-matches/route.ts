import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { canAccessEvent } from '@/lib/auth/eventAuth';
import { parseBulkFile, BulkFileError, BULK_MAX_BYTES } from '@/lib/matches/bulk';
import { z } from 'zod';
interface Context {params:Promise<{id:string}>;}
async function access(eventId:string) {
 const {data:{user}}=await (await createClient()).auth.getUser();
 if(!user) return {error:NextResponse.json({error:'Authentication required'},{status:401})};
 if(!z.string().uuid().safeParse(eventId).success || !await canAccessEvent(user.id,eventId))return {error:NextResponse.json({error:'Event administrator required'},{status:403})};
 return {user};
}
export async function GET(_request:NextRequest,{params}:Context) {
 const {id}=await params,auth=await access(id);if(auth.error)return auth.error;
 const {data,error}=await createServiceClient().from('match_import_batches').select('id,file_name,match_count,format,created_at').eq('event_id',id).order('created_at',{ascending:false});
 if(error)return NextResponse.json({error:'Could not load import batches'},{status:500});
 return NextResponse.json({batches:data},{headers:{'Cache-Control':'no-store'}});
}
export async function POST(request:NextRequest,{params}:Context) {
 const {id}=await params,auth=await access(id);if(auth.error)return auth.error;
 try {
  if(Number(request.headers.get('content-length') || 0)>BULK_MAX_BYTES+16384)return NextResponse.json({error:'The file must be at most 1 MB.'},{status:413});
  const form=await request.formData(),file=form.get('file');
  const settings=z.object({batch_id:z.string().uuid(),format:z.enum(['bo1','bo3','bo5'])}).safeParse({batch_id:form.get('batch_id'),format:form.get('format') || 'bo3'});
  if(!settings.success || !(file instanceof File) || !/\.(csv|txt)$/i.test(file.name) || file.name.length>200)return NextResponse.json({error:'Choose a TXT or CSV file and a valid match format.'},{status:400});
  if(file.size>BULK_MAX_BYTES)return NextResponse.json({error:'The file must be at most 1 MB.'},{status:413});
  const rows=parseBulkFile(await file.text()),db=createServiceClient();
  const {data:template}=await db.from('veto_templates').select('id,game_id,sequence').eq('format',settings.data.format).eq('is_default',true).single();
  if(!template)return NextResponse.json({error:'No default veto template is configured for this format.'},{status:400});
  const {data:maps,error:mapError}=await db.from('maps').select('id,name').eq('game_id',template.game_id).eq('is_active',true).in('name',['Abyss','Bind','Breeze','Corrode','Haven','Pearl','Split']).order('name');
  if(mapError || maps?.length!==7)return NextResponse.json({error:'The competitive seven-map pool is not configured for this template.'},{status:400});
  const {data,error}=await db.rpc('bulk_create_matches',{p_event_id:id,p_user_id:auth.user!.id,p_batch_id:settings.data.batch_id,p_file_name:file.name,p_template_id:template.id,p_rows:rows,p_maps:maps.map(map=>map.id)});
  if(error)return NextResponse.json({error:error.message},{status:409});
  return NextResponse.json({success:true,...data});
 } catch(error) {
  if(error instanceof BulkFileError)return NextResponse.json({error:error.message},{status:400});
  return NextResponse.json({error:'Could not read or import the file. Please retry.'},{status:500});
 }
}
