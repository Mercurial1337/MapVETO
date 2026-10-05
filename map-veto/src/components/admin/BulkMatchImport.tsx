'use client';
import { useRef, useState } from 'react';
import { parseBulkFile, BULK_HEADER, BULK_MAX_BYTES, type BulkRow } from '@/lib/matches/bulk';
interface Props {events:{id:string;name:string}[];eventId:string|null;onClose:()=>void;onImported:(eventId:string,batchId:string)=>void;}
export function BulkMatchImport({events,eventId,onClose,onImported}:Props) {
 const [selectedEvent,setSelectedEvent]=useState(eventId || ''),[format,setFormat]=useState('bo3');
 const [file,setFile]=useState<File|null>(null),[rows,setRows]=useState<BulkRow[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const batchId=useRef<string|null>(null);
 const fileVersion=useRef(0);
 async function selectFile(next:File|null) {
  const version=++fileVersion.current;setFile(null);setRows([]);setError('');batchId.current=null;
  if(!next)return;
  try {
   if(!/\.(csv|txt)$/i.test(next.name))throw new Error('Choose a .csv or .txt file.');
   if(next.size>BULK_MAX_BYTES)throw new Error('The file must be at most 1 MB.');
   const parsed=parseBulkFile(await next.text());if(version!==fileVersion.current)return;
   setFile(next);setRows(parsed);
  } catch(e) {if(version===fileVersion.current)setError(e instanceof Error?e.message:'Could not read the file.');}
 }
 async function importMatches() {
  if(!file || !selectedEvent || busy)return;
  setBusy(true);setError('');batchId.current ??=crypto.randomUUID();
  const body=new FormData();body.set('file',file);body.set('format',format);body.set('batch_id',batchId.current);
  try {
   const response=await fetch(`/api/events/${selectedEvent}/bulk-matches`,{method:'POST',body});
   const data=await response.json();if(!response.ok)throw new Error(data.error || 'Import failed.');
   onImported(selectedEvent,data.batch_id);
  } catch(e){setError(e instanceof Error?e.message:'Connection failed. Retry with the same file.');}
  finally{setBusy(false);}
 }
 function sample() {
  const url=URL.createObjectURL(new Blob([`${BULK_HEADER}\n1, Fnatic, Sentinels, A\n2, Paper Rex, LOUD, B\n3, G2, Liquid, C\n`],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download='bulk-matches-example.csv';a.click();URL.revokeObjectURL(url);
 }
 return <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
  <section role="dialog" aria-modal="true" aria-labelledby="bulk-import-title" className="w-full max-w-2xl max-h-[90vh] overflow-auto border border-white/30 bg-[#18181b] p-5 rounded">
   <h2 id="bulk-import-title" className="text-xl font-bold mb-3">Bulk create matches</h2>
   <p className="text-sm text-white/70 mb-3">A / B: higher seed chooses Team A or B after check-in. C: automatic coin toss when both teams are ready. All rows use the selected format and competitive seven-map pool.</p>
   <form onSubmit={e=>{e.preventDefault();void importMatches();}} className="space-y-3">
    <label className="block">Event<select required value={selectedEvent} disabled={busy || !!eventId} onChange={e=>{setSelectedEvent(e.target.value);batchId.current=null;}} className="w-full p-2 bg-black border border-white/30"><option value="">Choose an event</option>{events.map(event=><option key={event.id} value={event.id}>{event.name}</option>)}</select></label>
    <label className="block">Match format<select value={format} disabled={busy} onChange={e=>{setFormat(e.target.value);batchId.current=null;}} className="w-full p-2 bg-black border border-white/30"><option value="bo1">BO1</option><option value="bo3">BO3</option><option value="bo5">BO5</option></select></label>
    <label className="block">TXT or CSV file<input type="file" accept=".txt,.csv,text/plain,text/csv" disabled={busy} onChange={e=>void selectFile(e.target.files?.[0] || null)} className="block w-full mt-1"/></label>
    <p className="text-xs text-white/60">Up to 500 matches, 1 MB. Each match number must be unique within this file. Quote team names containing commas.</p>
    <button type="button" className="btn-secondary px-3 py-2" onClick={sample}>Download example CSV</button>
    {error && <p role="alert" className="text-red-400">{error}</p>}
    {rows.length>0 && <><p>{rows.length} matches ready to import from {file?.name}.</p><div className="overflow-auto max-h-52"><table className="w-full text-sm"><thead><tr><th>Match</th><th>Team A</th><th>Team B</th><th>Selection</th></tr></thead><tbody>{rows.slice(0,20).map(row=><tr key={row.match_number}><td>{row.match_number}</td><td>{row.team_a_name}</td><td>{row.team_b_name}</td><td>{row.selection==='C'?'Automatic toss':`Higher seed ${row.selection}`}</td></tr>)}</tbody></table></div>{rows.length>20 && <p className="text-xs text-white/60">Showing the first 20 rows.</p>}</>}
    <div className="flex gap-2"><button className="btn-primary px-4 py-2" disabled={busy || !selectedEvent || !file}>{busy?'Creating matches…':`Create ${rows.length || ''} matches`}</button><button type="button" className="btn-secondary px-4 py-2" disabled={busy} onClick={onClose}>Cancel</button></div>
   </form>
  </section>
 </div>;
}
