'use client';
import {useCallback,useMemo,useRef,useState} from 'react';
import {useRealtime} from '@/lib/realtime';
import {TimeoutBrowserAlerts} from '@/components/admin/TimeoutBrowserAlerts';
import {timeoutRequests} from '@/lib/veto/timeoutRequests';

export function RefereePanel({matchId,token}:{matchId:string;token:string}) {
 const {match,logs,refresh}=useRealtime();
 const alerts=useMemo(()=>match?timeoutRequests(logs).filter(report=>!report.resolvedAt).map(report=>({id:report.id,matchId,teamA:match.team_a_name,teamB:match.team_b_name,requestedBy:report.actor==='team_a'?match.team_a_name:match.team_b_name})):[],[match,logs,matchId]);
 const openTimeouts=useCallback(()=>window.dispatchEvent(new Event('veto-open-timeouts')),[]);
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[reason,setReason]=useState(''),[error,setError]=useState('');
 const requestId=useRef<string|null>(null);
 const pending=match?.reset_request;
 async function requestReset() {
  if(busy || !reason.trim())return;
  setBusy(true);setError('');requestId.current??=crypto.randomUUID();
  try {
   const response=await fetch('/api/veto/reset-requests',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation:'request',match_id:matchId,token,request_id:requestId.current,reason})});
   const data=await response.json();if(!response.ok)throw new Error(data.error || 'Could not request reset.');
   await refresh();requestId.current=null;setReason('');
  } catch(e){setError(e instanceof Error?e.message:'Connection failed. Retry the request.');}
  finally{setBusy(false);}
 }
 return <aside className="fixed bottom-4 right-4 z-[60]">
  <TimeoutBrowserAlerts requests={alerts} onSelect={openTimeouts}/>
  {open && <section aria-label="Referee reset controls" className="mb-2 p-4 w-80 max-h-[75vh] overflow-auto bg-[#18181b] border border-white/30 rounded">
   <h2 className="font-bold mb-2">Referee</h2>
   <p className="text-sm text-white/70 mb-3">Reset requires both teams’ approval. The veto continues until both agree.</p>
   {pending?<p role="status">Reset requested. {match?.team_a_name || 'Team A'} {pending.team_a_approved_at?'approved':'has not approved'}; {match?.team_b_name || 'Team B'} {pending.team_b_approved_at?'approved':'has not approved'}.</p>:<><label className="block text-sm">Reset reason<textarea maxLength={500} className="w-full bg-black border border-white/30 p-2" value={reason} onChange={e=>{setReason(e.target.value);requestId.current=null;}}/></label><button className="btn-secondary p-2 mt-3" disabled={busy || !reason.trim()} onClick={()=>void requestReset()}>{busy?'Requesting…':'Request veto reset'}</button></>}
   {error && <p role="alert" className="text-red-400 mt-2">{error}</p>}
  </section>}
  <button aria-expanded={open} className="btn-secondary px-4 py-2" onClick={()=>setOpen(!open)}>Referee controls</button>
 </aside>;
}

export function ResetApproval({matchId,token}:{matchId:string;token:string}) {
 const {match,userRole,refresh}=useRealtime();
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const request=match?.reset_request;
 if(!request || (userRole!=='team_a' && userRole!=='team_b'))return null;
 const approved=userRole==='team_a'?request.team_a_approved_at:request.team_b_approved_at;
 if(approved)return <p role="status" className="border border-white/30 p-3">You approved the reset. Waiting for the other team; the veto continues.</p>;
 async function answer(approve:boolean) {
  if(busy || !request)return;
  setBusy(true);setError('');
  try {
   const response=await fetch('/api/veto/reset-requests',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation:'answer',match_id:matchId,token,request_id:request.id,approve})});
   const data=await response.json();if(!response.ok)throw new Error(data.error || 'Could not answer reset request.');
   await refresh();
  } catch(e){setError(e instanceof Error?e.message:'Connection failed. Please retry.');}
  finally{setBusy(false);}
 }
 return <div className="fixed inset-0 z-[70] bg-black/80 flex items-center justify-center p-4"><section role="dialog" aria-modal="true" aria-labelledby="reset-approval-title" className="w-full max-w-lg p-5 bg-[#18181b] border border-white/30 rounded">
  <h2 id="reset-approval-title" className="text-xl font-bold mb-3">Approve referee’s veto reset?</h2>
  <p className="mb-3">{request.reason}</p><p className="text-sm text-white/70 mb-3">Both teams must agree. Until then, the veto continues. Approval by both teams clears the selections and returns both teams to check-in.</p>
  {error && <p role="alert" className="text-red-400 mb-3">{error}</p>}
  <div className="flex gap-3"><button className="btn-primary p-2" disabled={busy} onClick={()=>void answer(true)}>Approve reset</button><button className="btn-secondary p-2" disabled={busy} onClick={()=>void answer(false)}>Decline reset</button></div>
 </section></div>;
}
