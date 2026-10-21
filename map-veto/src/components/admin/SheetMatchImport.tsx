'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import type {SheetRow} from '@/lib/sheets/parse';
import {parseVetoTime,vetoTimeInput,formatVetoTime} from '@/lib/sheets/parse';
import {MatchLinksDialog} from './MatchLinksDialog';
import {VetoSchedulePicker} from './VetoSchedulePicker';
interface Tab{id:number;title:string;}
interface Source{id:string;source_id:string;tab_id:number;approved:boolean;selection:'A'|'B'|'C';status:string;issue:string;match_id:string|null;was_created:boolean;password_update:boolean;schedule_overridden?:boolean;schedule_override?:string|null;created_schedule?:string|null;}
const PASSWORD_LABELS:Record<SheetRow['password_status'],string>={supplied:'Both team passwords supplied',missing:'Team password missing',invalid:'Team password invalid',not_used:'No password column'};
interface Info{connection:{spreadsheet_id:string;active_tabs:Tab[];last_sync_at:string|null;last_error:string|null}|null;tabs:Tab[];role:string;serviceAccount:string|null;backgroundSync:boolean;}
interface Preview{tab:Tab;rows:SheetRow[];hash:string;sources:Source[];existing:{id:string;team_a_name:string;team_b_name:string;format:string}[];}
type Outcome='created'|'already_imported'|'waiting'|'conflict'|'deleted';
const OUTCOMES:[Outcome,string][]=[['created','Created now'],['already_imported','Already imported — no duplicate created'],['waiting','Approved, waiting for both opponents'],['conflict','Not created — needs review'],['deleted','Not recreated — the veto was deleted']];
const REVIEWED:(keyof SheetRow)[]=['team_a','team_b','format','status','password_status','round','mapveto_time'];
// Rows that may be checked: ready or waiting, not yet created, and owned by this day tab.
const eligible=(row:SheetRow,saved:Source|undefined,day:string)=>['ready','waiting'].includes(row.status) && !saved?.was_created && !(saved && saved.tab_id!==Number(day));
export function SheetMatchImport({eventId}:{eventId:string}) {
 const [info,setInfo]=useState<Info|null>(null),[sheet,setSheet]=useState(''),[tab,setTab]=useState(''),[preview,setPreview]=useState<Preview|null>(null);
 const [choices,setChoices]=useState<Record<string,'A'|'B'|'C'>>({}),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [changed,setChanged]=useState<Set<string>>(new Set()),[result,setResult]=useState<Partial<Record<Outcome,string[]>>|null>(null);
 const [linksMatch,setLinksMatch]=useState<string|null>(null);
 const [times,setTimes]=useState<Record<string,string>>({});
 const url=`/api/events/${eventId}/sheet`,readOnly=info?.role==='referee';
 async function request(path:string,body?:unknown){const response=await fetch(path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{cache:'no-store'});const data=await response.json();if(!response.ok)throw Object.assign(new Error(data.error||'Sheet request failed.'),{stale:!!data.stale});return data;}
 useEffect(()=>{let disposed=false;fetch(url,{cache:'no-store'}).then(async r=>{const data=await r.json();if(!r.ok)throw new Error(data.error);if(!disposed){setInfo(data);setSheet(data.connection?.spreadsheet_id||'');}}).catch(e=>{if(!disposed)setError(e.message);});return()=>{disposed=true;};},[url]);
 async function reload(){const data=await request(url);setInfo(data);return data as Info;}
 // keep=true re-reads after the sheet changed: the organizer's checks survive for rows that are still
 // eligible, new rows stay unchecked, and changed rows are flagged for another review.
 async function loadPreview(day:string,keep=false){
  const data:Preview=await request(url+'?tab='+day),before=keep && preview?new Map(preview.rows.map(row=>[row.source_id,row])):null;
  const saved=(row:SheetRow)=>data.sources.find(s=>s.source_id===row.source_id);
  const selected:Record<string,'A'|'B'|'C'>={};
  for(const row of data.rows){if(!eligible(row,saved(row),day))continue;if(before){if(choices[row.source_id])selected[row.source_id]=choices[row.source_id];}else if(saved(row)?.approved ?? true)selected[row.source_id]=saved(row)?.selection||'C';}
  setChanged(new Set(before?data.rows.filter(row=>{const old=before.get(row.source_id);return !old || REVIEWED.some(key=>old[key]!==row[key]);}).map(row=>row.source_id):[]));
  const nextTimes:Record<string,string>={};for(const row of data.rows){const source=saved(row);if(before && times[row.source_id]!==undefined)nextTimes[row.source_id]=times[row.source_id];else if(source?.schedule_overridden)nextTimes[row.source_id]=vetoTimeInput(source.schedule_override||null);}
  setTimes(nextTimes);setPreview(data);setChoices(selected);
 }
 // A stale preview is refreshed in place and must be reviewed again before confirming.
 async function guarded(action:()=>Promise<void>){try{await action();}catch(e){if(e instanceof Error && (e as Error&{stale?:boolean}).stale && tab)await loadPreview(tab,true);throw e;}}
 async function run(action:()=>Promise<void>){if(busy)return;setBusy(true);setError('');setNotice('');try{await action();}catch(e){setError(e instanceof Error?e.message:'Connection failed. Retry.');}finally{setBusy(false);}}
 return <div className="space-y-5">
  {linksMatch && <MatchLinksDialog key={linksMatch} matchId={linksMatch} onClose={()=>setLinksMatch(null)}/>}
  <div className="flex items-center justify-between"><h1 className="text-2xl font-bold">Google Sheets matches</h1><Link href={`/admin/matches?event=${eventId}`} className="btn-secondary px-3 py-2">Event matches</Link></div>
  <p className="text-sm text-white/70">Select a day, review its matches, then confirm. Approved matches with unresolved opponents wait until the sheet provides both names. New vetoes use the system competitive map pool.</p>
  <section className="border border-white/20 rounded p-4 space-y-3">
   <form onSubmit={e=>{e.preventDefault();void run(async()=>{await request(url,{operation:'connect',sheet});await reload();setPreview(null);setTab('');setNotice('Sheet connected. Choose a day to preview.');});}} className="flex flex-wrap items-end gap-3">
    <label className="flex-1 min-w-64">Google Sheets URL or ID<input className="block w-full min-h-11 bg-black border border-white/30 p-2 mt-1" value={sheet} disabled={busy||readOnly} onChange={e=>setSheet(e.target.value)} required/></label>
    {!readOnly && <button className="btn-secondary min-h-11 px-4 py-2" disabled={busy}>{info?.connection?'Check connection':'Connect sheet'}</button>}
   </form>
   <p className="text-sm text-white/70">Add <strong>MapVETO Match ID</strong> and <strong>Format</strong> columns. Put a unique permanent ID and BO1/BO3/BO5 on the first team row of each match.</p>
   <p className="text-sm text-white/70">In the <strong>Password</strong> column, enter each team’s own password on its team row. Both rows need a valid password before importing a protected match.</p>
   <p className="text-sm text-white/70"><strong>MapVETO Time:</strong> use YYYY-MM-DD HH:mm, for example 2026-10-24 18:00. All times are GMT+3. Leave blank for an unscheduled veto. Review or change each time below before confirming.</p>
   {info?.serviceAccount?<p className="text-sm text-white/70">For a private workbook, share Viewer access with {info.serviceAccount}.</p>:<p className="text-sm text-white/70">Public sheets work now. Private sheets require Google service-account credentials on the server.</p>}
  </section>
  {error && <p role="alert" className="border border-red-400/50 p-3 text-red-300">{error}</p>}
  {notice && <p role="status" className="border border-green-400/50 p-3">{notice}</p>}
  {info?.connection && <section className="space-y-3">
   <div className="flex flex-wrap items-end gap-3"><label>Day tab<select className="block min-h-11 bg-black border border-white/30 p-2 mt-1" value={tab} disabled={busy} onChange={e=>{const day=e.target.value;setTab(day);setPreview(null);setResult(null);if(day)void run(()=>loadPreview(day));}}><option value="">Choose a day</option>{info.tabs.map(t=><option key={t.id} value={t.id}>{t.title}</option>)}</select></label>
    {tab && <button className="btn-secondary min-h-11 px-3 py-2" disabled={busy} onClick={()=>void run(()=>loadPreview(tab,!!preview))}>Refresh preview</button>}
    {!readOnly && <button className="btn-secondary min-h-11 px-3 py-2" disabled={busy||!info.connection.active_tabs.length} onClick={()=>void run(async()=>{const result=await request(url,{operation:'sync'});await reload();if(tab)await loadPreview(tab);setNotice(`Sync complete: ${result.created} created, ${result.waiting} waiting, ${result.conflicts} need review.`);})}>Sync approved matches now</button>}
   </div>
   <p className="text-sm text-white/70">Active days: {info.connection.active_tabs.map(t=>t.title).join(', ')||'None'}. {info.backgroundSync?'Approved days sync in the background every minute.':'Background sync starts after deployment with a configured production URL. Use Sync now for local testing.'}</p>
   {info.connection.last_sync_at && <p className="text-xs text-white/60">Last sync: {new Date(info.connection.last_sync_at).toLocaleString()}</p>}
   {info.connection.last_error && <p role="alert" className="text-red-300">Last sync error: {info.connection.last_error}</p>}
   {tab && !readOnly && info.connection.active_tabs.some(t=>t.id===Number(tab)) && <button className="btn-secondary min-h-11 px-3 py-2" disabled={busy} onClick={()=>void run(async()=>{await request(url,{operation:'stop',tab:Number(tab)});await reload();setNotice('Automatic sync stopped for this day. Existing vetoes remain.');})}>Stop this day’s automatic sync</button>}
  </section>}
  {preview && <section className="space-y-3">
   <h2 className="text-lg font-semibold">{preview.tab.title}: review before creating</h2>
   {(()=>{const saved=(row:SheetRow)=>preview.sources.find(s=>s.source_id===row.source_id),count=(test:(row:SheetRow)=>boolean)=>preview.rows.filter(test).length;
    const counts:[string,number][]=[['ready to create',count(row=>!!choices[row.source_id] && row.status==='ready')],['approved and waiting for opponents',count(row=>!!choices[row.source_id] && row.status==='waiting')],['blocked or conflicting',count(row=>row.status==='invalid' || ['conflict','deleted'].includes(saved(row)?.status||'') || !!saved(row)?.password_update)],['already imported',count(row=>!!saved(row)?.was_created)],['skipped by the sheet',count(row=>row.status==='skipped')],['not selected',count(row=>eligible(row,saved(row),tab) && !choices[row.source_id])]];
    return <ul aria-label="Selection summary" className="flex flex-wrap gap-2 text-sm">{counts.map(([label,value])=><li key={label} className="border border-white/20 rounded px-3 py-1"><strong>{value}</strong> {label}</li>)}</ul>;})()}
   {changed.size>0 && <p role="alert" className="border border-amber-400/50 p-3 text-amber-200">The sheet changed since your last review. {changed.size} row{changed.size===1?' is':'s are'} marked “Changed since review”. Your checks were kept for rows that can still be created; new rows are unchecked. Review them, then confirm again.</p>}
   {!info?.serviceAccount && preview.rows.some(row=>row.password_status==='supplied') && <p role="alert" className="border border-amber-400/50 p-3 text-amber-200">This workbook is read through public link access, so anyone with its link can read these passwords. For a real tournament, use a private workbook shared with the website’s service account.</p>}
   {!readOnly && <div className="flex gap-3"><button className="btn-secondary min-h-11 px-3 py-2" disabled={busy} onClick={()=>{const all:Record<string,'A'|'B'|'C'>={};for(const row of preview.rows)if(eligible(row,preview.sources.find(s=>s.source_id===row.source_id),tab))all[row.source_id]=choices[row.source_id]||'C';setChoices(all);}}>Select all eligible</button><button className="btn-secondary min-h-11 px-3 py-2" disabled={busy} onClick={()=>setChoices({})}>Uncheck all</button></div>}
   <div className="overflow-x-auto border border-white/20 rounded"><table className="w-full text-sm text-left"><thead className="bg-white/5"><tr>{['Create','Match ID / round','Team A','Team B','Format','MapVETO Time (GMT+3)','Team passwords','Higher seed / toss','Status'].map(text=><th className="p-3" key={text}>{text}</th>)}</tr></thead><tbody>{preview.rows.map(row=>{const saved=preview.sources.find(s=>s.source_id===row.source_id),locked=!eligible(row,saved,tab),status=saved?.was_created?saved.status:row.status,wasChanged=changed.has(row.source_id);return <tr className={`border-t border-white/10 ${wasChanged?'border-l-4 border-l-amber-400':''}`} key={row.row}>
    <td className="p-3"><input type="checkbox" className="h-5 w-5" aria-label={`Create ${row.source_id||'row '+row.row}`} checked={!!choices[row.source_id]} disabled={busy||readOnly||locked} onChange={e=>setChoices(previous=>{const next={...previous};if(e.target.checked)next[row.source_id]=saved?.selection||'C';else delete next[row.source_id];return next;})}/></td>
    <td className="p-3">{row.source_id||'Missing ID'}<span className="block text-white/60">{row.round} · row {row.row}</span></td><td className="p-3">{row.team_a||'—'}</td><td className="p-3">{row.team_b||'—'}</td><td className="p-3">{row.format?.toUpperCase()||'Missing format'}</td>
    <td className="p-3 min-w-64">{saved?.was_created?<span>{formatVetoTime(saved.created_schedule||null)}<span className="block text-xs text-white/50">Creation schedule; a full restart disables enforcement.</span></span>:<>
     <VetoSchedulePicker matchLabel={row.source_id} value={times[row.source_id]??vetoTimeInput(row.scheduled_at)} disabled={busy||readOnly||locked} onChange={value=>setTimes(previous=>({...previous,[row.source_id]:value}))}/>
     <span className="block text-xs text-white/60 mt-1">GMT+3 · Sheet: {row.mapveto_time||'No schedule'}</span>
     {times[row.source_id]===undefined && row.schedule_error && <span className="block text-xs text-red-300">{row.schedule_error}</span>}
     {!readOnly && !locked && <button type="button" className="underline text-xs min-h-8" onClick={()=>setTimes(previous=>({...previous,[row.source_id]:''}))}>Use no schedule</button>}
    </>}</td>
    <td className="p-3"><span className={row.password_status==='missing' || row.password_status==='invalid'?'text-red-300':''}>{PASSWORD_LABELS[row.password_status]}</span>
    {saved?.password_update && <span className="block text-xs text-amber-300">New team passwords awaiting approval</span>}
    {!readOnly && saved?.password_update && <button disabled={busy} className="underline block min-h-11 text-left" onClick={()=>{if(confirm(`Replace both team passwords for ${row.source_id}? Each team must enter its own password; existing team sessions end.`))void run(()=>guarded(async()=>{await request(url,{operation:'password',tab:Number(tab),hash:preview.hash,source:saved.id});await loadPreview(tab);setNotice(`${row.source_id}: new team passwords are active. Each team must enter its own password again.`);}));}}>Approve team passwords</button>}
    </td>
    <td className="p-3"><select aria-label={`Selection ${row.source_id||'row '+row.row}`} className="min-h-11 bg-black border border-white/30 p-2" value={choices[row.source_id]||saved?.selection||'C'} disabled={busy||readOnly||locked||!choices[row.source_id]} onChange={e=>setChoices(previous=>({...previous,[row.source_id]:e.target.value as 'A'|'B'|'C'}))}><option value="C">C — Automatic toss</option><option value="A">A — First team higher seed</option><option value="B">B — Second team higher seed</option></select></td>
    <td className="p-3">{wasChanged && <span className="block text-xs font-semibold text-amber-300">Changed since review</span>}{saved?.was_created?status:row.status==='invalid'?'Blocked':saved?.status==='conflict'?'Needs review':choices[row.source_id]?status:'Excluded'}<span className="block text-xs text-white/60">{saved?.was_created||saved?.status==='conflict'?saved.issue:row.issue}</span>{saved?.match_id && <button type="button" className="underline block text-left min-h-8" onClick={()=>setLinksMatch(saved.match_id)}>Get match links</button>}
    {!readOnly && saved?.status==='conflict' && !saved.was_created && preview.existing.filter(m=>m.team_a_name.toLowerCase()===row.team_a.toLowerCase()&&m.team_b_name.toLowerCase()===row.team_b.toLowerCase()&&m.format===row.format).map(m=><button key={m.id} disabled={busy} className="underline block min-h-11 text-left" onClick={()=>void run(async()=>{await request(url,{operation:'link',source:saved.id,match:m.id});await loadPreview(tab);setNotice('Existing match linked. No duplicate was created.');})}>Link existing match {m.id.slice(0,8)}</button>)}
    </td>
   </tr>;})}</tbody></table></div>
   {preview.sources.filter(s=>s.tab_id===Number(tab)&&!preview.rows.some(r=>r.source_id===s.source_id)).map(s=><p key={s.source_id} className="text-amber-300">{s.source_id}: Missing from the sheet. Existing veto and import history remain.</p>)}
   {!readOnly && <div className="border border-white/20 rounded p-4 space-y-3">
    <p className="text-sm text-white/70">Ready matches are created when you confirm. Checked fixtures that are still waiting for opponents are approved now and created automatically, once, when the sheet shows both teams. Unchecked and newly added fixtures are never created without another confirmation. The workbook is re-read on confirmation; if anything changed, you will be asked to review again.</p>
    <p className="text-sm text-white/70">Check-in opens at the scheduled time. Ten minutes later, absent teams remain automated. For two absent teams, alphabetical maps and random sides apply.</p>
    <button className="btn-primary min-h-11 px-4 py-2" disabled={busy||!preview.rows.length} onClick={()=>void run(()=>guarded(async()=>{const selected=Object.entries(choices).map(([source_id,selection])=>{const row=preview.rows.find(r=>r.source_id===source_id)!;if(times[source_id]===undefined){if(row.schedule_error)throw new Error(`${source_id}: correct MapVETO Time or choose Use no schedule.`);return {source_id,selection};}const parsed=parseVetoTime(times[source_id]);if(parsed.schedule_error)throw new Error(`${source_id}: ${parsed.schedule_error}`);return {source_id,selection,scheduled_at:parsed.scheduled_at};});
     const expired=selected.some(choice=>{const at='scheduled_at' in choice?choice.scheduled_at:preview.rows.find(r=>r.source_id===choice.source_id)?.scheduled_at;return at && Date.parse(at)+600000<=Date.now();});if(expired && !confirm('Some MapVETO check-in deadlines have already passed. Creating these matches will immediately apply the no-show rules. Continue?'))return;
     setResult(null);const response=await request(url,{operation:'confirm',tab:Number(tab),hash:preview.hash,choices:selected});
     const grouped:Partial<Record<Outcome,string[]>>={};for(const item of (response.results||[]) as {source_id:string;outcome:Outcome}[])(grouped[item.outcome]??=[]).push(item.source_id);
     setResult(grouped);await reload();await loadPreview(tab);setNotice(`Confirmed: ${response.created} created, ${response.waiting} approved and waiting, ${response.conflicts} need review.`);}))}>{busy?'Working…':'Confirm selected matches'}</button>
    <p className="text-sm text-white/60">Confirmation saves your checked and unchecked choices. Existing matches are never recreated or silently changed. If confirmation fails, your selection is kept so you can correct it.</p>
   </div>}
   {result && <section role="status" aria-label="Confirmation result" className="border border-white/20 rounded p-4 space-y-2">
    <h2 className="font-semibold">Confirmation result</h2>
    {Object.keys(result).length?OUTCOMES.filter(([key])=>result[key]?.length).map(([key,label])=><p key={key} className="break-words"><strong>{label} ({result[key]!.length}):</strong> {result[key]!.join(', ')}</p>):<p>No matches were selected. Your exclusions were saved.</p>}
   </section>}
  </section>}
 </div>;
}
