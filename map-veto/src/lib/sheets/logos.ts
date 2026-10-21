import {after} from 'next/server';
import {createServiceClient} from '@/lib/supabase/server';
import type {SheetTab} from './google';
import type {LogoTarget} from './logoImport';

export function queueSheetLogos(eventId:string,spreadsheet:string,tab:SheetTab) {
 after(async()=>{
  try{await applySheetLogos(eventId,spreadsheet,tab);}
  catch{console.warn('Optional sheet logos could not be processed',{eventId,tabId:tab.id});}
 });
}
async function applySheetLogos(eventId:string,spreadsheet:string,tab:SheetTab) {
 const db=createServiceClient();
 const {data,error}=await db.rpc('sheet_claim_logos',{p_event:eventId,p_spreadsheet:spreadsheet,p_tab:tab.id});
 if(error)throw new Error('Could not claim optional logo work');
 if(!data?.length)return;
 const complete=async(sourceId:string)=>{
  const {error}=await db.from('sheet_match_sources').update({logos_checked_at:new Date().toISOString(),logos_retry_after:null}).eq('id',sourceId).eq('event_id',eventId);
  if(error)throw new Error('Could not save logo status');
 };
 const targets:LogoTarget[]=[];
 for(const source of data){
  if((source.logo_a && source.logo_b) || !Number.isInteger(source.row_number)){await complete(source.source_id);continue;}
  targets.push({sourceId:source.source_id,matchId:source.match_id,row:source.row_number,teamA:source.team_a,teamB:source.team_b,logoA:source.logo_a,logoB:source.logo_b});
 }
 if(!targets.length)return;
 // Image libraries load only for pending background work, never to open a preview.
 const [{exportLogoWorkbook},{embeddedLogos},{importTeamLogos}]=await Promise.all([import('./google'),import('./embeddedLogos'),import('./logoImport')]);
 const bucket=db.storage.from('event-assets');
 await importTeamLogos({
  targets,readImages:async()=>embeddedLogos(await exportLogoWorkbook(spreadsheet),tab.title,new Map(targets.flatMap(target=>[[target.row,target.teamA],[target.row+1,target.teamB]] as [number,string][]))),
  store:async(path,bytes)=>{
   const {data:exists}=await bucket.exists(path);
   if(!exists){const {error}=await bucket.upload(path,bytes,{contentType:'image/webp',cacheControl:'31536000',upsert:false});if(error && !('statusCode' in error && String(error.statusCode)==='409'))throw new Error('Could not store team logo');}
   return bucket.getPublicUrl(path).data.publicUrl;
  },
  attach:async(target,logos)=>{
   for(const [key,url] of Object.entries(logos)){
    const {data:updated,error}=await db.from('matches').update({[key]:url}).eq('id',target.matchId).eq('event_id',eventId).eq('sheet_source_id',target.sourceId).is(key,null).select('id');
    if(error)throw new Error('Could not attach team logo');
    if(updated?.length)await db.from('event_teams').update({logo_url:url}).eq('event_id',eventId).eq('name',key==='team_a_logo'?target.teamA:target.teamB).is('logo_url',null);
   }
  },complete,
  retry:async(sourceIds)=>{
   const {error}=await db.from('sheet_match_sources').update({logos_retry_after:new Date(Date.now()+3600000).toISOString()}).eq('event_id',eventId).in('id',sourceIds);
   if(error)throw new Error('Could not defer optional logos');
  },
 });
}
