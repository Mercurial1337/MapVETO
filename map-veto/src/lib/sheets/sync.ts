import {createHash} from 'node:crypto';
import {createServiceClient} from '@/lib/supabase/server';
import {readTab,listTabs,type SheetTab} from './google';
import {parseDay,visibleRow} from './parse';
import type {ParsedRow,SheetFormat} from './parse';
import {COMPETITIVE_MAPS} from '@/lib/maps/pools';
import {accessSecret} from '@/lib/auth/teamAccess';
import {hashPassword,passwordFingerprint} from '@/lib/auth/teamPassword';
import {scopeDayPreview} from './preview';
type Choice={source_id:string;selection:'A'|'B'|'C';scheduled_at?:string|null};
interface SavedSource {source_id:string;approved:boolean;was_created:boolean;}
export async function withCompetitiveMaps<T extends {format:SheetFormat|null}>(rows:T[]) {
 const db=createServiceClient(),format=rows.find(row=>row.format)?.format||'bo3';
 const {data:template,error}=await db.from('veto_templates').select('game_id').eq('format',format).order('is_default',{ascending:false}).order('created_at').order('id').limit(1).single();
 if(error || !template)throw new Error('No veto template for this sheet format.');
 const {data:maps,error:mapError}=await db.from('maps').select('id').eq('game_id',template.game_id).eq('is_active',true).in('name',COMPETITIVE_MAPS);
 if(mapError || maps?.length!==7)throw new Error('The system competitive pool must have seven active maps.');
 return rows.map(row=>({...row,maps:maps.map(map=>map.id)}));
}
export const previewHash=(rows:unknown)=>createHash('sha256').update(JSON.stringify(rows)).digest('hex');
// Plaintext passwords stay in this process. Previews and stale checks use a keyed
// fingerprint; SQL also receives a salted hash for rows that may create a match now.
async function fingerprinted(rows:ParsedRow[]) {
 const secret=rows.some(row=>row.password!==null)?await accessSecret():'';
 return rows.map(({password,team_b_password,...row})=>({...row,password_fingerprint:password===null || team_b_password===null?null:passwordFingerprint(JSON.stringify([password,team_b_password]),secret)}));
}
export async function protectRows(rows:ParsedRow[],sources:SavedSource[],choices:Choice[]|null) {
 const safe=await fingerprinted(rows);
 return Promise.all(safe.map(async(row,index)=>{
  const password=rows[index].password,saved=sources.find(source=>source.source_id===row.source_id);
  const creatable=password!==null && row.status==='ready' && !saved?.was_created && (choices?choices.some(choice=>choice.source_id===row.source_id):!!saved?.approved);
  return {...row,password_hash:creatable?await hashPassword(password):null,team_b_password_hash:creatable?await hashPassword(rows[index].team_b_password!):null};
 }));
}
export async function loadDay(eventId:string,tabId:number) {
 const db=createServiceClient();
 const {data:connection,error}=await db.from('event_sheet_connections').select('*').eq('event_id',eventId).single();
 if(error || !connection)throw new Error('Connect a Google Sheet first.');
 const tabs=await listTabs(connection.spreadsheet_id),tab=tabs.find(t=>t.id===tabId);
 if(!tab)throw new Error('Day tab not found. Refresh the connection.');
 const rows=parseDay(await readTab(connection.spreadsheet_id,tab)),safe=await fingerprinted(rows);
 const {data:saved,error:sourceError}=await db.from('sheet_match_sources').select('id,source_id,tab_id,tab_title,approved,selection,status,issue,match_id,was_created,schedule_overridden,schedule_override,created_schedule:created_snapshot->>scheduled_at,created_password:created_snapshot->>password_fingerprint').eq('event_id',eventId).eq('spreadsheet_id',connection.spreadsheet_id);
 if(sourceError)throw new Error('Could not load import history.');
 // Fingerprints stay on the server; the preview only learns that a new password awaits approval.
 const scoped=scopeDayPreview(rows.map(visibleRow),saved||[],tab.id);
 const sources=scoped.sources.map(({created_password,...source})=>{const fingerprint=safe.find(row=>row.source_id===source.source_id)?.password_fingerprint;return {...source,password_update:!!(source.was_created && source.match_id && fingerprint && fingerprint!==created_password)};});
 const {data:existing,error:existingError}=await db.from('matches').select('id,team_a_name,team_b_name,format').eq('event_id',eventId).is('sheet_source_id',null).neq('status','cancelled').limit(500);
 if(existingError)throw new Error('Could not check existing matches.');
 return {connection,tab,rows,preview:scoped.rows,hash:previewHash(safe),sources,existing:existing||[]};
}
export async function syncConnection(connection:{event_id:string;spreadsheet_id:string;connected_by:string;active_tabs:SheetTab[]}) {
 const db=createServiceClient();let created=0,waiting=0,conflicts=0;const started=performance.now();
 try {
  const tabs=await listTabs(connection.spreadsheet_id);
  for(const active of connection.active_tabs){if(performance.now()-started>35000)throw new Error('Google is responding slowly. Remaining days will retry on the next sync.');const tab=tabs.find(t=>t.id===active.id);if(!tab)throw new Error(`Day tab ${active.title} was removed. Reconnect or stop its sync.`);
   const parsed=parseDay(await readTab(connection.spreadsheet_id,tab));let sources:SavedSource[]=[];
   if(parsed.some(row=>row.password!==null)){const saved=await db.from('sheet_match_sources').select('source_id,approved,was_created').eq('event_id',connection.event_id).eq('spreadsheet_id',connection.spreadsheet_id).eq('tab_id',tab.id);if(saved.error)throw new Error('Could not load import history.');sources=saved.data;}
   const rows=await withCompetitiveMaps(await protectRows(parsed,sources,null));
   const {data,error}=await db.rpc('sheet_apply_day',{p_event:connection.event_id,p_user:connection.connected_by,p_spreadsheet:connection.spreadsheet_id,p_tab:tab.id,p_title:tab.title,p_rows:rows,p_choices:null});
   if(error)throw new Error(error.message);created+=data.created;waiting+=data.waiting;conflicts+=data.conflicts;
  }
  const {error}=await db.from('event_sheet_connections').update({last_sync_at:new Date().toISOString(),last_error:null,lease_until:null}).eq('event_id',connection.event_id).eq('spreadsheet_id',connection.spreadsheet_id);
  if(error)throw new Error('Could not save sync status.');return {created,waiting,conflicts};
 }catch(error){await db.from('event_sheet_connections').update({last_sync_at:new Date().toISOString(),last_error:error instanceof Error?error.message:'Sheet sync failed',lease_until:null}).eq('event_id',connection.event_id).eq('spreadsheet_id',connection.spreadsheet_id);throw error;}
}
export async function configureWorker() {
 const raw=process.env.VERCEL_PROJECT_PRODUCTION_URL?`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`:process.env.NEXT_PUBLIC_APP_URL;
 if(!raw)return false;
 const origin=new URL(raw);if(origin.protocol!=='https:' || ['localhost','127.0.0.1'].includes(origin.hostname))return false;
 const {error}=await createServiceClient().from('sheet_worker_settings').update({endpoint:origin.origin+'/api/sheets/worker'}).eq('id',true);
 if(error)throw new Error('Could not configure background sync.');return true;
}
