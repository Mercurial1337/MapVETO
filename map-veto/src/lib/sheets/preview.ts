import type {SheetRow} from './parse';

interface DaySource {source_id:string;tab_id:number;tab_title:string;}
/** Cross-day IDs are conflicts, never imports or password updates for this day. */
export function scopeDayPreview<T extends DaySource>(rows:SheetRow[],sources:T[],tabId:number) {
 const byId=new Map(sources.map(source=>[source.source_id,source]));
 return {
  rows:rows.map(row=>{
   const source=byId.get(row.source_id);
   return source && source.tab_id!==tabId
    ? {...row,status:'invalid' as const,issue:`Match ID ${row.source_id} is registered on ${source.tab_title}. Use a unique ID for this match. Unchecked conflicts do not block selected matches.`}
    : row;
  }),
  sources:sources.filter(source=>source.tab_id===tabId),
 };
}
