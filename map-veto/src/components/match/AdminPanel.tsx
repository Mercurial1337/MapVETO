'use client';
import { useCallback,useMemo,useState } from 'react';
import { useRealtime } from '@/lib/realtime';
import { timeoutRequests } from '@/lib/veto/timeoutRequests';
import {TimeoutBrowserAlerts} from '@/components/admin/TimeoutBrowserAlerts';
interface Props {matchId:string;matchStatus:string;isPaused?:boolean;token:string;}
export function AdminPanel({matchId,matchStatus,isPaused,token}:Props) {
 const [open,setOpen]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [reason,setReason]=useState('');
 const {state,logs,match,refresh}=useRealtime();
 const pending=timeoutRequests(logs).filter(report=>!report.resolvedAt).length;
 const alerts=useMemo(()=>match?timeoutRequests(logs).filter(report=>!report.resolvedAt).map(report=>({id:report.id,matchId,teamA:match.team_a_name,teamB:match.team_b_name,requestedBy:report.actor==='team_a'?match.team_a_name:match.team_b_name})):[],[match,logs,matchId]);
 const openTimeouts=useCallback(()=>window.dispatchEvent(new Event('veto-open-timeouts')),[]);
 async function action(operation:string) {
  if(busy) return;
  if(!reason.trim()) {setError('Enter a reason for the audit log.');return;}
  if(operation==='reset' && !confirm('Restart this veto? Selections will be cleared and the history retained.')) return;
  setBusy(true);setError('');
  try {
   const response=await fetch('/api/veto/admin/override',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({match_id:matchId,token,operation,reason,turn_started_at:state?.turn_started_at})});
   const data=await response.json();
   if(!response.ok) {setError(data.error || 'Override failed');return;}
   await refresh();
  } catch {setError('Connection failed. Please retry.');}
  finally {setBusy(false);}
 }
 return <section aria-label="Head Admin override controls" className="match-panel space-y-4">
  <div className="flex items-center justify-between gap-3"><h2 className="font-semibold">Head Admin controls</h2><button aria-expanded={open} aria-controls="head-admin-controls-panel" className="btn-secondary px-3 py-2 text-xs" onClick={()=>setOpen(!open)}>{open?'Hide':'Show'}</button></div>
  {open && <div id="head-admin-controls-panel" className="space-y-3">
   <label className="block text-sm text-white/70">Reason for the action<textarea rows={3} className="match-input mt-2" maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></label>
   {error && <p role="alert" className="text-red-400 my-2">{error}</p>}
   <div className="grid grid-cols-2 gap-2">
    <button className="btn-secondary min-h-11 px-3 py-2 text-sm" disabled={busy || !['in_progress','side_selection','coin_toss'].includes(matchStatus)} onClick={()=>action(isPaused?'resume':'pause')}>{isPaused?'Resume veto':'Pause veto'}</button>
    <button className="btn-secondary min-h-11 px-3 py-2 text-sm" disabled={busy || !['in_progress','side_selection'].includes(matchStatus)} onClick={()=>action('restart')}>Restart timer</button>
    <button className="btn-secondary min-h-11 px-3 py-2 text-sm col-span-2" disabled={busy} onClick={()=>action('undo')}>Reopen last selection</button>
   </div>
   <p className="text-sm text-white/70 mb-3">To reopen an earlier selection, choose its step in the veto step row.</p>
   <div className="border-t border-white/10 pt-3"><button className="btn-secondary btn-danger min-h-11 w-full px-3 py-2 text-sm" disabled={busy} onClick={()=>action('reset')}>Restart entire veto</button></div>
   </div>}
  {pending>0 && <button className="btn-secondary w-full px-3 py-2 text-sm" onClick={openTimeouts}>View {pending} pending timeout{pending===1?'':'s'}</button>}
  <div className="border-t border-white/10 pt-2 text-white/60"><TimeoutBrowserAlerts requests={alerts} onSelect={openTimeouts}/></div>
 </section>;
}
