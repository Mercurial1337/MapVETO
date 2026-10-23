'use client';
import { useState } from 'react';
import { useRealtime } from '@/lib/realtime';
interface Props {matchId:string;matchStatus:string;isPaused?:boolean;token:string;}
export function AdminPanel({matchId,matchStatus,isPaused,token}:Props) {
 const [open,setOpen]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [reason,setReason]=useState('');
 const {state,refresh}=useRealtime();
 async function action(operation:string) {
  if(busy) return;
  // Pause and resume act instantly; other overrides need a reason for the audit log.
  const quick=operation==='pause' || operation==='resume';
  if(!quick && !reason.trim()) {setError('Enter a reason for this action.');return;}
  const note=reason.trim() || (operation==='pause'?'Paused by Head Ref':'Resumed by Head Ref');
  if(operation==='reset' && !confirm('Restart this veto? Selections will be cleared, scheduled check-in/no-show restrictions will be removed, and both teams can check in normally. History is retained.')) return;
  setBusy(true);setError('');
  try {
   const response=await fetch('/api/veto/admin/override',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({match_id:matchId,token,operation,reason:note,turn_started_at:state?.turn_started_at})});
   const data=await response.json();
   if(!response.ok) {setError(data.error || 'Override failed');return;}
   setReason('');await refresh();
  } catch {setError('Connection failed. Please retry.');}
  finally {setBusy(false);}
 }
 return <section aria-label="Head Ref override controls" className="match-panel space-y-4">
  <div className="panel-head"><h2>Head Ref controls</h2><button aria-expanded={open} aria-controls="head-admin-controls-panel" className="min-h-9 px-3 py-1 text-xs font-bold uppercase border border-[#161616] rounded" onClick={()=>setOpen(!open)}>{open?'Hide':'Show'}</button></div>
  {open && <div id="head-admin-controls-panel" className="space-y-3">
   <form className="space-y-2" onSubmit={e=>{e.preventDefault();if(['in_progress','side_selection','coin_toss'].includes(matchStatus))void action(isPaused?'resume':'pause');}}>
    <label className="block text-sm text-white/70">Reason <span className="text-white/50">(optional to pause or resume)</span><input className="match-input min-h-11 mt-1" maxLength={500} value={reason} onChange={e=>setReason(e.target.value)} placeholder="e.g. Player reconnecting"/></label>
    <button className={`min-h-11 w-full px-3 py-2 text-sm font-semibold rounded border ${isPaused?'btn-resume':'btn-pause'}`} disabled={busy || !['in_progress','side_selection','coin_toss'].includes(matchStatus)}>{busy?'Saving…':isPaused?'Resume veto':'Pause veto'}</button>
   </form>
   {error && <p role="alert" className="text-red-400 my-2">{error}</p>}
   <div className="grid grid-cols-2 gap-2">
    <button className="btn-secondary min-h-11 px-3 py-2 text-sm" disabled={busy || !['in_progress','side_selection'].includes(matchStatus)} onClick={()=>action('restart')}>Restart timer</button>
    <button className="btn-secondary min-h-11 px-3 py-2 text-sm" disabled={busy} onClick={()=>action('undo')}>Reopen last selection</button>
   </div>
   <p className="text-sm text-white/70 mb-3">To reopen an earlier selection, choose its step in the veto step row.</p>
   <div className="border-t border-white/10 pt-3"><button className="btn-secondary btn-danger min-h-11 w-full px-3 py-2 text-sm" disabled={busy} onClick={()=>action('reset')}>Restart entire veto</button></div>
   </div>}
 </section>;
}
