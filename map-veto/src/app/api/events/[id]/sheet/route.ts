import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {createClient,createServiceClient} from '@/lib/supabase/server';
import {getEventRole} from '@/lib/auth/eventAuth';
import {spreadsheetId} from '@/lib/sheets/parse';
import {listTabs} from '@/lib/sheets/google';
import {loadDay,configureWorker,syncConnection,withCompetitiveMaps} from '@/lib/sheets/sync';
interface Context{params:Promise<{id:string}>;}
export const maxDuration=60;
async function access(id:string,write=false){const {data:{user}}=await (await createClient()).auth.getUser();if(!user)return {error:NextResponse.json({error:'Authentication required'},{status:401})};const role=await getEventRole(user.id,id);if(!role || (write && role==='referee'))return {error:NextResponse.json({error:'Head Admin access required'},{status:403})};return {user,role};}
const json=(data:unknown)=>NextResponse.json(data,{headers:{'Cache-Control':'no-store'}});
export async function GET(request:NextRequest,{params}:Context){
 const {id}=await params,auth=await access(id);if(auth.error)return auth.error;
 try {
  const tab=request.nextUrl.searchParams.get('tab');
  if(tab!==null){if(!/^\d+$/.test(tab))return NextResponse.json({error:'Invalid tab ID'},{status:400});const day=await loadDay(id,Number(tab));return json({tab:day.tab,rows:day.rows,hash:day.hash,sources:day.sources,existing:day.existing});}
  const db=createServiceClient();const {data:connection,error}=await db.from('event_sheet_connections').select('spreadsheet_id,active_tabs,last_sync_at,last_error').eq('event_id',id).maybeSingle();if(error)throw new Error('Could not load sheet connection.');
  const {data:worker}=await db.from('sheet_worker_settings').select('endpoint').eq('id',true).single();
  return json({connection,tabs:connection?await listTabs(connection.spreadsheet_id):[],role:auth.role,serviceAccount:process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL||null,backgroundSync:!!worker?.endpoint});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Could not read sheet'},{status:400});}
}
const schema=z.discriminatedUnion('operation',[
 z.object({operation:z.literal('connect'),sheet:z.string().max(300)}),
 z.object({operation:z.literal('confirm'),tab:z.number().int().nonnegative(),hash:z.string().length(64),choices:z.array(z.object({source_id:z.string().min(1).max(100),selection:z.enum(['A','B','C'])})).max(500)}),
 z.object({operation:z.literal('sync')}),z.object({operation:z.literal('stop'),tab:z.number().int().nonnegative()}),
 z.object({operation:z.literal('link'),source:z.string().uuid(),match:z.string().uuid()}),
]);
export async function POST(request:NextRequest,{params}:Context){
 const {id}=await params,auth=await access(id,true);if(auth.error)return auth.error;
 try {
  if(Number(request.headers.get('content-length')||0)>100000)return NextResponse.json({error:'Request too large'},{status:413});
  const parsed=schema.safeParse(await request.json());if(!parsed.success)return NextResponse.json({error:'Invalid sheet request'},{status:400});const body=parsed.data,db=createServiceClient();
  if(body.operation==='connect'){
   const sheet=spreadsheetId(body.sheet),tabs=await listTabs(sheet);
   const {data:current}=await db.from('event_sheet_connections').select('spreadsheet_id').eq('event_id',id).maybeSingle();
   if(current && current.spreadsheet_id!==sheet)return NextResponse.json({error:'This event already has a different sheet connected. Use a new event for another workbook.'},{status:409});
   const {error:eventError}=await db.from('events').update({google_sheet_id:sheet}).eq('id',id);if(eventError)throw new Error(eventError.message);
   const {error}=await db.from('event_sheet_connections').update({connected_by:auth.user!.id}).eq('event_id',id);if(error)throw new Error(error.message);
   return json({success:true,tabs,backgroundSync:await configureWorker()});
  }
  if(body.operation==='confirm'){
   const day=await loadDay(id,body.tab);
   if(body.hash!==day.hash)return NextResponse.json({error:'The sheet changed since preview. Refresh and review the matches again.'},{status:409});
   if(new Set(body.choices.map(c=>c.source_id)).size!==body.choices.length)return NextResponse.json({error:'Duplicate selection IDs'},{status:400});
   const {data,error}=await db.rpc('sheet_apply_day',{p_event:id,p_user:auth.user!.id,p_spreadsheet:day.connection.spreadsheet_id,p_tab:day.tab.id,p_title:day.tab.title,p_rows:await withCompetitiveMaps(day.rows),p_choices:body.choices});if(error)return NextResponse.json({error:error.message},{status:409});
   // The most recent Head Admin approval remains the authority for future syncs.
   const {error:updateError}=await db.from('event_sheet_connections').update({connected_by:auth.user!.id}).eq('event_id',id);if(updateError)throw new Error(updateError.message);
   return json({success:true,...data,backgroundSync:await configureWorker()});
  }
  if(body.operation==='link'){const {error}=await db.rpc('sheet_link_existing',{p_event:id,p_user:auth.user!.id,p_source:body.source,p_match:body.match});if(error)return NextResponse.json({error:error.message},{status:409});return json({success:true});}
  const {data:connection,error}=await db.from('event_sheet_connections').select('*').eq('event_id',id).single();if(error)throw new Error('Connect a sheet first.');
  if(body.operation==='stop'){const {error:stopError}=await db.from('event_sheet_connections').update({active_tabs:connection.active_tabs.filter((tab:{id:number})=>tab.id!==body.tab)}).eq('event_id',id);if(stopError)throw new Error(stopError.message);return json({success:true});}
  return json({success:true,...await syncConnection({...connection,connected_by:auth.user!.id})});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Sheet operation failed'},{status:400});}
}
