'use client';
import { useMemo, useRef, useState } from 'react';
import { useRealtime } from '@/lib/realtime';
import { timeoutRequests, type TimeoutRequest } from '@/lib/veto/timeoutRequests';
import { ActionLog } from './ActionLog';

async function submitTimeout(body:Record<string,unknown>) {
 const response=await fetch('/api/veto/timeouts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const data=await response.json();
 if(!response.ok) throw new Error(data.error || 'Could not save the timeout request.');
}

export function TimeoutRequestButton({matchId,token}:{matchId:string;token:string}) {
 const {logs,userRole,match,refresh}=useRealtime();
 const reports=useMemo(()=>timeoutRequests(logs),[logs]);
 const [open,setOpen]=useState(false),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const requestId=useRef<string|null>(null);
 if(userRole!=='team_a' && userRole!=='team_b') return null;
 const pending=reports.some(report=>report.actor===userRole && !report.resolvedAt);
 const active=match && ['ready_check','coin_toss','side_selection','in_progress'].includes(match.status);
 if(!active && !pending) return null;
 async function send() {
  if(busy || !reason.trim()) return;
  setBusy(true);setError('');
  requestId.current ??=crypto.randomUUID();
  try {
   await submitTimeout({operation:'request',match_id:matchId,token,request_id:requestId.current,reason});
   setOpen(false);setReason('');requestId.current=null;await refresh();
  } catch(e) {setError(e instanceof Error?e.message:'Connection failed. Please retry.');}
  finally {setBusy(false);}
 }
 return <>
  <div className="fixed bottom-4 left-4 z-[60]"><button className="btn-secondary px-4 py-2" disabled={pending || !active} onClick={()=>setOpen(true)}>{pending?'Timeout pending':'Request timeout'}</button></div>
  {open && <div className="fixed inset-0 z-[70] bg-black/80 flex items-center justify-center p-4">
   <section role="dialog" aria-modal="true" aria-labelledby="timeout-title" className="w-full max-w-md bg-[#18181b] border border-white/30 p-5 rounded">
    <h2 id="timeout-title" className="font-bold text-lg mb-2">Request timeout</h2>
    <p className="text-sm text-white/70 mb-3">Describe the problem for the referee. The timer continues until the referee pauses the veto.</p>
    <form onSubmit={e=>{e.preventDefault();void send();}}>
     <label className="block">What happened?<textarea required maxLength={1000} value={reason} disabled={busy} onChange={e=>{setReason(e.target.value);requestId.current=null;}} className="w-full bg-black border border-white/30 p-2 mt-1" rows={4}/></label>
     {error && <p role="alert" className="text-red-400 my-2">{error}</p>}
     <div className="flex gap-2 mt-3"><button className="btn-primary px-3 py-2" disabled={busy || !reason.trim()}>{busy?'Sending…':'Send timeout request'}</button><button type="button" className="btn-secondary px-3 py-2" disabled={busy} onClick={()=>{setOpen(false);setError('');}}>Cancel</button></div>
    </form>
   </section>
  </div>}
 </>;
}

function TimeoutItem({report,team,canResolve,matchId,token}:{report:TimeoutRequest;team:string;canResolve:boolean;matchId:string;token:string}) {
 const {refresh}=useRealtime();
 const [resolution,setResolution]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function resolve() {
  if(busy || !resolution.trim()) return;
  setBusy(true);setError('');
  try {await submitTimeout({operation:'resolve',match_id:matchId,token,request_id:report.id,resolution});await refresh();}
  catch(e) {setError(e instanceof Error?e.message:'Connection failed. Please retry.');}
  finally {setBusy(false);}
 }
 return <li className="border border-white/20 p-3 rounded">
  <p className="font-semibold">{team} · {report.resolvedAt?'Resolved':'Open'}</p>
  <time className="text-xs text-white/60" dateTime={report.createdAt}>{new Date(report.createdAt).toLocaleString()}</time>
  <p className="my-2 whitespace-pre-wrap break-words">{report.reason}</p>
  {report.resolvedAt ? <><p className="text-green-300 whitespace-pre-wrap break-words">Referee: {report.resolution}</p><time className="text-xs text-white/60" dateTime={report.resolvedAt}>{new Date(report.resolvedAt).toLocaleString()}</time></> : canResolve ? <form onSubmit={e=>{e.preventDefault();void resolve();}}>
   <label className="block text-sm">Resolution<textarea required maxLength={1000} rows={3} className="w-full bg-black border border-white/30 p-2 mt-1" value={resolution} disabled={busy} onChange={e=>setResolution(e.target.value)}/></label>
   {error && <p role="alert" className="text-red-400 my-2">{error}</p>}
   <button className="btn-secondary px-3 py-2 mt-2" disabled={busy || !resolution.trim()}>{busy?'Resolving…':'Resolve timeout'}</button>
  </form> : <p className="text-white/60 text-sm">Waiting for the referee.</p>}
 </li>;
}

export function TimeoutsPanel({isAdmin,matchId,token}:{isAdmin:boolean;matchId:string;token:string}) {
 const {logs,match}=useRealtime();
 const reports=useMemo(()=>timeoutRequests(logs),[logs]);
 if(!match) return null;
 return <div className="max-h-[480px] overflow-y-auto">
  <p className="text-sm text-white/60 mb-3">Requests do not pause the veto. {isAdmin?'Use Referee controls to pause or resume separately.':'The referee decides when to pause.'}</p>
  {reports.length ? <ul aria-label="Timeout requests" className="space-y-3">{reports.map(report=><TimeoutItem key={report.id} report={report} team={report.actor==='team_a'?match.team_a_name:match.team_b_name} canResolve={isAdmin} matchId={matchId} token={token}/>)}</ul> : <p className="text-white/60">No timeout requests.</p>}
 </div>;
}

export function MatchActivity({mapNames,isAdmin,matchId,token}:{mapNames:Record<string,string>;isAdmin:boolean;matchId:string;token:string}) {
 const {logs,match}=useRealtime();
 const [tab,setTab]=useState<'log'|'timeouts'>('log');
 const reports=useMemo(()=>timeoutRequests(logs),[logs]);
 const count=reports.filter(report=>!report.resolvedAt).length;
 if(!match) return null;
 return <>
  <div role="tablist" aria-label="Match activity" className="flex flex-wrap gap-2 mb-3">
   <button role="tab" id="activity-log-tab" aria-selected={tab==='log'} aria-controls="activity-log" className="btn-secondary px-2 py-1 text-sm" onClick={()=>setTab('log')}>Action log</button>
   <button role="tab" id="activity-timeouts-tab" aria-selected={tab==='timeouts'} aria-controls="activity-timeouts" className="btn-secondary px-2 py-1 text-sm" onClick={()=>setTab('timeouts')}>Timeouts{count?` (${count})`:''}</button>
  </div>
  {tab==='log' ? <div role="tabpanel" id="activity-log" aria-labelledby="activity-log-tab"><ActionLog logs={logs} dbTeamAName={match.team_a_name} dbTeamBName={match.team_b_name} displayTeam1Name={match.team_a_name} displayTeam2Name={match.team_b_name} mapNames={mapNames}/></div>
  : <div role="tabpanel" id="activity-timeouts" aria-labelledby="activity-timeouts-tab">
   <TimeoutsPanel isAdmin={isAdmin} matchId={matchId} token={token}/>
  </div>}
 </>;
}
