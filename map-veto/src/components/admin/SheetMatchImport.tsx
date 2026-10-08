'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import type {SheetRow} from '@/lib/sheets/parse';
interface Tab{id:number;title:string;}
interface Source{id:string;source_id:string;tab_id:number;approved:boolean;selection:'A'|'B'|'C';status:string;issue:string;match_id:string|null;was_created:boolean;}
interface Info{connection:{spreadsheet_id:string;active_tabs:Tab[];last_sync_at:string|null;last_error:string|null}|null;tabs:Tab[];role:string;serviceAccount:string|null;backgroundSync:boolean;}
interface Preview{rows:SheetRow[];hash:string;sources:Source[];existing:{id:string;team_a_name:string;team_b_name:string;format:string}[];}
export function SheetMatchImport({eventId}:{eventId:string}) {
 const [info,setInfo]=useState<Info|null>(null),[sheet,setSheet]=useState(''),[tab,setTab]=useState(''),[preview,setPreview]=useState<Preview|null>(null);
 const [choices,setChoices]=useState<Record<string,'A'|'B'|'C'>>({}),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const url=`/api/events/${eventId}/sheet`,readOnly=info?.role==='referee';
 async function request(path:string,body?:unknown){const response=await fetch(path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{cache:'no-store'});const data=await response.json();if(!response.ok)throw new Error(data.error||'Sheet request failed.');return data;}
 useEffect(()=>{let disposed=false;fetch(url,{cache:'no-store'}).then(async r=>{const data=await r.json();if(!r.ok)throw new Error(data.error);if(!disposed){setInfo(data);setSheet(data.connection?.spreadsheet_id||'');}}).catch(e=>{if(!disposed)setError(e.message);});return()=>{disposed=true;};},[url]);
 async function reload(){const data=await request(url);setInfo(data);return data as Info;}
 async function loadPreview(day:string){const data:Preview=await request(url+'?tab='+day);setPreview(data);const selected:Record<string,'A'|'B'|'C'>={};for(const row of data.rows){const saved=data.sources.find(s=>s.source_id===row.source_id);if(saved?.was_created || (saved && saved.tab_id!==Number(day)))continue;if((saved?saved.approved:true) && ['ready','waiting'].includes(row.status))selected[row.source_id]=saved?.selection||'C';}setChoices(selected);}
 async function run(action:()=>Promise<void>){if(busy)return;setBusy(true);setError('');setNotice('');try{await action();}catch(e){setError(e instanceof Error?e.message:'Connection failed. Retry.');}finally{setBusy(false);}}
 return <div className="space-y-5">
  <div className="flex items-center justify-between"><h1 className="text-2xl font-bold">Google Sheets matches</h1><Link href={`/admin/matches?event=${eventId}`} className="btn-secondary px-3 py-2">Event matches</Link></div>
  <p className="text-sm text-white/70">Select a day, review its matches, then confirm. Approved matches with unresolved opponents wait until the sheet provides both names. New vetoes use the system competitive map pool.</p>
  <section className="border border-white/20 rounded p-4 space-y-3">
   <form onSubmit={e=>{e.preventDefault();void run(async()=>{await request(url,{operation:'connect',sheet});await reload();setPreview(null);setTab('');setNotice('Sheet connected. Choose a day to preview.');});}} className="flex flex-wrap items-end gap-3">
    <label className="flex-1 min-w-64">Google Sheets URL or ID<input className="block w-full bg-black border border-white/30 p-2 mt-1" value={sheet} disabled={busy||readOnly} onChange={e=>setSheet(e.target.value)} required/></label>
    {!readOnly && <button className="btn-secondary px-4 py-2" disabled={busy}>{info?.connection?'Check connection':'Connect sheet'}</button>}
   </form>
   <p className="text-sm text-white/70">Add <strong>MapVETO Match ID</strong> and <strong>Format</strong> columns. Put a unique permanent ID and BO1/BO3/BO5 on the first team row of each match.</p>
   {info?.serviceAccount?<p className="text-sm text-white/70">For a private workbook, share Viewer access with {info.serviceAccount}.</p>:<p className="text-sm text-white/70">Public sheets work now. Private sheets require Google service-account credentials on the server.</p>}
  </section>
  {error && <p role="alert" className="border border-red-400/50 p-3 text-red-300">{error}</p>}
  {notice && <p role="status" className="border border-green-400/50 p-3">{notice}</p>}
  {info?.connection && <section className="space-y-3">
   <div className="flex flex-wrap items-end gap-3"><label>Day tab<select className="block bg-black border border-white/30 p-2 mt-1" value={tab} disabled={busy} onChange={e=>{const day=e.target.value;setTab(day);setPreview(null);if(day)void run(()=>loadPreview(day));}}><option value="">Choose a day</option>{info.tabs.map(t=><option key={t.id} value={t.id}>{t.title}</option>)}</select></label>
    {tab && <button className="btn-secondary px-3 py-2" disabled={busy} onClick={()=>void run(()=>loadPreview(tab))}>Refresh preview</button>}
    {!readOnly && <button className="btn-secondary px-3 py-2" disabled={busy||!info.connection.active_tabs.length} onClick={()=>void run(async()=>{const result=await request(url,{operation:'sync'});await reload();if(tab)await loadPreview(tab);setNotice(`Sync complete: ${result.created} created, ${result.waiting} waiting, ${result.conflicts} need review.`);})}>Sync approved matches now</button>}
   </div>
   <p className="text-sm text-white/70">Active days: {info.connection.active_tabs.map(t=>t.title).join(', ')||'None'}. {info.backgroundSync?'Approved days sync in the background every minute.':'Background sync starts after deployment with a configured production URL. Use Sync now for local testing.'}</p>
   {info.connection.last_sync_at && <p className="text-xs text-white/60">Last sync: {new Date(info.connection.last_sync_at).toLocaleString()}</p>}
   {info.connection.last_error && <p role="alert" className="text-red-300">Last sync error: {info.connection.last_error}</p>}
   {tab && !readOnly && info.connection.active_tabs.some(t=>t.id===Number(tab)) && <button className="btn-secondary px-3 py-2" disabled={busy} onClick={()=>void run(async()=>{await request(url,{operation:'stop',tab:Number(tab)});await reload();setNotice('Automatic sync stopped for this day. Existing vetoes remain.');})}>Stop this day’s automatic sync</button>}
  </section>}
  {preview && <section className="space-y-3">
   <p>{preview.rows.length} matches in this day. {Object.keys(choices).length} selected.</p>
   {!readOnly && <div className="flex gap-3"><button className="btn-secondary px-3 py-2" disabled={busy} onClick={()=>{const all:Record<string,'A'|'B'|'C'>={};for(const row of preview.rows)if(['ready','waiting'].includes(row.status)&&!preview.sources.some(s=>s.source_id===row.source_id&&s.was_created))all[row.source_id]=choices[row.source_id]||'C';setChoices(all);}}>Select all eligible</button><button className="btn-secondary px-3 py-2" disabled={busy} onClick={()=>setChoices({})}>Uncheck all</button></div>}
   <div className="overflow-x-auto border border-white/20 rounded"><table className="w-full text-sm text-left"><thead className="bg-white/5"><tr>{['Create','Match ID / round','Team A','Team B','Format','Higher seed / toss','Status'].map(text=><th className="p-3" key={text}>{text}</th>)}</tr></thead><tbody>{preview.rows.map(row=>{const saved=preview.sources.find(s=>s.source_id===row.source_id),locked=!!saved?.was_created || !['ready','waiting'].includes(row.status) || (!!saved && saved.tab_id!==Number(tab)),status=saved?.was_created?saved.status:row.status;return <tr className="border-t border-white/10" key={row.row}>
    <td className="p-3"><input type="checkbox" aria-label={`Create ${row.source_id||'row '+row.row}`} checked={!!choices[row.source_id]} disabled={busy||readOnly||locked} onChange={e=>setChoices(previous=>{const next={...previous};if(e.target.checked)next[row.source_id]=saved?.selection||'C';else delete next[row.source_id];return next;})}/></td>
    <td className="p-3">{row.source_id||'Missing ID'}<span className="block text-white/60">{row.round} · row {row.row}</span></td><td className="p-3">{row.team_a||'—'}</td><td className="p-3">{row.team_b||'—'}</td><td className="p-3">{row.format?.toUpperCase()||'Missing format'}</td>
    <td className="p-3"><select aria-label={`Selection ${row.source_id||'row '+row.row}`} className="bg-black border border-white/30 p-2" value={choices[row.source_id]||saved?.selection||'C'} disabled={busy||readOnly||locked||!choices[row.source_id]} onChange={e=>setChoices(previous=>({...previous,[row.source_id]:e.target.value as 'A'|'B'|'C'}))}><option value="C">C — Automatic toss</option><option value="A">A — First team higher seed</option><option value="B">B — Second team higher seed</option></select></td>
    <td className="p-3">{saved?.was_created?status:saved?.status==='conflict'?'Needs review':choices[row.source_id]?status:'Excluded'}<span className="block text-xs text-white/60">{saved?.was_created||saved?.status==='conflict'?saved.issue:row.issue}</span>{saved?.match_id && <Link className="underline block" href={`/admin/matches?event=${eventId}&match=${saved.match_id}`}>Get match links</Link>}
    {!readOnly && saved?.status==='conflict' && !saved.was_created && preview.existing.filter(m=>m.team_a_name.toLowerCase()===row.team_a.toLowerCase()&&m.team_b_name.toLowerCase()===row.team_b.toLowerCase()&&m.format===row.format).map(m=><button key={m.id} disabled={busy} className="underline block" onClick={()=>void run(async()=>{await request(url,{operation:'link',source:saved.id,match:m.id});await loadPreview(tab);setNotice('Existing match linked. No duplicate was created.');})}>Link existing match {m.id.slice(0,8)}</button>)}
    </td>
   </tr>;})}</tbody></table></div>
   {preview.sources.filter(s=>s.tab_id===Number(tab)&&!preview.rows.some(r=>r.source_id===s.source_id)).map(s=><p key={s.source_id} className="text-amber-300">{s.source_id}: Missing from the sheet. Existing veto and import history remain.</p>)}
   {!readOnly && <button className="btn-primary px-4 py-2" disabled={busy||!preview.rows.length} onClick={()=>void run(async()=>{const result=await request(url,{operation:'confirm',tab:Number(tab),hash:preview.hash,choices:Object.entries(choices).map(([source_id,selection])=>({source_id,selection}))});await reload();await loadPreview(tab);setNotice(`Confirmed: ${result.created} created, ${result.waiting} approved and waiting, ${result.conflicts} need review.`);})}>{busy?'Working…':'Confirm selected matches'}</button>}
   <p className="text-sm text-white/60">Confirmation saves your checked and unchecked choices. Existing matches are never recreated or silently changed.</p>
  </section>}
 </div>;
}
