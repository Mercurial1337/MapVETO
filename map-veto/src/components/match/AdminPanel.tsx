'use client';
import { useState } from 'react';
import { useRealtime } from '@/lib/realtime';
interface Props {matchId:string;matchStatus:string;isPaused?:boolean;token:string;}
export function AdminPanel({matchId,matchStatus,isPaused,token}:Props) {
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [reason,setReason]=useState(''),[mapId,setMapId]=useState(''),[side,setSide]=useState<'attack'|'defense'>('attack');
 const {state,maps,refresh}=useRealtime();
 async function action(operation:string) {
  if(busy) return;
  if(!reason.trim()) {setError('Enter a reason for the audit log.');return;}
  if(operation==='reset' && !confirm('Restart this veto? Selections will be cleared and the history retained.')) return;
  setBusy(true);setError('');
  try {
   const response=await fetch('/api/veto/admin/override',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({match_id:matchId,token,operation,reason,map_id:mapId || undefined,side,turn_started_at:state?.turn_started_at})});
   const data=await response.json();
   if(!response.ok) {setError(data.error || 'Override failed');return;}
   await refresh();
  } catch {setError('Connection failed. Please retry.');}
  finally {setBusy(false);}
 }
 return <aside className="fixed bottom-4 right-4 z-[60]">
  {open && <section aria-label="Referee override controls" className="mb-2 p-4 w-80 max-h-[75vh] overflow-auto bg-[#18181b] border border-white/30 rounded">
   <h2 className="font-bold mb-3">Referee override</h2>
   <label className="block text-sm">Reason<textarea className="w-full bg-black border border-white/30 p-2 mt-1" maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></label>
   {error && <p role="alert" className="text-red-400 my-2">{error}</p>}
   <div className="flex flex-wrap gap-2 my-3">
    <button className="btn-secondary p-2" disabled={busy || !['in_progress','side_selection','coin_toss'].includes(matchStatus)} onClick={()=>action(isPaused?'resume':'pause')}>{isPaused?'Resume':'Pause'}</button>
    <button className="btn-secondary p-2" disabled={busy || !['in_progress','side_selection'].includes(matchStatus)} onClick={()=>action('restart')}>Restart current timer</button>
    <button className="btn-secondary p-2" disabled={busy} onClick={()=>action('undo')}>Reopen last selection</button>
   </div>
   <label className="block text-sm">Map to force or correct<select className="w-full bg-black border border-white/30 p-2 mt-1" value={mapId} onChange={e=>setMapId(e.target.value)}><option value="">Choose a map</option>{maps.map(map=><option key={map.id} value={map.id}>{map.name}{state?.available_maps.includes(map.id)?' (available)':''}</option>)}</select></label>
   <label className="block text-sm mt-2">Side to force or correct<select className="w-full bg-black border border-white/30 p-2 mt-1" value={side} onChange={e=>setSide(e.target.value as 'attack'|'defense')}><option value="attack">Attack</option><option value="defense">Defense</option></select></label>
   <div className="flex flex-wrap gap-2 my-3"><button className="btn-secondary p-2" disabled={busy || matchStatus!=='in_progress'} onClick={()=>action('force')}>Force current selection</button><button className="btn-secondary p-2" disabled={busy} onClick={()=>action('correct')}>Correct last selection</button></div>
   <button className="btn-secondary p-2 text-red-400" disabled={busy} onClick={()=>action('reset')}>Restart entire veto</button>
  </section>}
  <button aria-expanded={open} className="btn-secondary px-4 py-2" onClick={()=>setOpen(!open)}>Referee controls</button>
 </aside>;
}
