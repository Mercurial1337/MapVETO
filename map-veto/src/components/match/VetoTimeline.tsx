'use client';
import type { VetoStep } from '@/types';
import { useRef, useState } from 'react';
import { useRealtime } from '@/lib/realtime';
interface TimelineStep extends VetoStep {completed?:boolean;map_name?:string;side_choice?:string;}
interface Props {steps:TimelineStep[];currentStep:number;teamAName:string;teamBName:string;headAdmin?:{matchId:string;token:string;status:string;clock?:string|null};}
export function VetoTimeline({steps,currentStep,teamAName,teamBName,headAdmin}:Props) {
 const {refresh}=useRealtime();
 const [target,setTarget]=useState<{index:number;clock:string;current:number}|null>(null);
 const [reason,setReason]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const requestId=useRef(''),submitting=useRef(false);
 const canReopen=Boolean(headAdmin?.clock && ['in_progress','completed'].includes(headAdmin.status));
 async function reopen() {
  if(!target || !headAdmin || submitting.current)return;
  submitting.current=true;setBusy(true);setError('');
  try {
   const response=await fetch('/api/veto/admin/override',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({match_id:headAdmin.matchId,token:headAdmin.token,operation:'reopen_step',target_step:target.index,current_step:target.current,turn_started_at:target.clock,reason,request_id:requestId.current})});
   const data=await response.json();
   if(!response.ok){setError(data.error || 'Could not reopen this step.');return;}
   setTarget(null);await refresh();
  }catch{setError('Connection failed. Retry to check whether the step was reopened.');}
  finally{submitting.current=false;setBusy(false);}
 }
 return <>
 {canReopen && <p className="px-4 pt-3 text-xs text-white/70">Head Admin: select a completed team step to reopen it.</p>}
 <ol aria-label="Veto steps" className="flex overflow-x-auto gap-2 px-4 py-3 text-xs">
  {steps.map((step,index)=><li key={step.step ?? index} aria-current={index===currentStep?'step':undefined} className={`shrink-0 px-3 py-2 border rounded ${index===currentStep?'border-yellow-400 text-yellow-300':index<currentStep?'border-green-700 text-green-300':'border-white/20 text-white/50'}`}>
   {canReopen && index<currentStep && step.action!=='decider' ? <button className="text-left cursor-pointer hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-white" aria-label={`Reopen step ${index+1}: ${step.action}`} onClick={()=>{setTarget({index,clock:headAdmin!.clock!,current:currentStep});setReason('');setError('');requestId.current=crypto.randomUUID();}}><span className="font-semibold">{index+1}. {step.action}</span><span className="block mt-1">{step.actor==='team_a'?teamAName:step.actor==='team_b'?teamBName:'System'}</span></button> : <><span className="font-semibold">{index+1}. {step.action}</span><span className="block mt-1">{step.actor==='team_a'?teamAName:step.actor==='team_b'?teamBName:'System'}</span></>}
  </li>)}
 </ol>
 {target && <dialog ref={node=>{if(node && !node.open)node.showModal();}} onCancel={event=>{event.preventDefault();if(!busy)setTarget(null);}} aria-labelledby="reopen-step-title" className="match-panel m-auto text-white max-w-md w-[calc(100%_-_2rem)] max-h-[calc(100dvh-2rem)] overflow-y-auto backdrop:bg-black/70">
   <h2 id="reopen-step-title" className="font-bold">Reopen step {target.index+1}</h2>
   <p className="text-sm text-white/80 my-3">This selection and every later selection will be cleared. Earlier selections stay. The current pause state is preserved, with a fresh 60-second timer.</p>
   <form onSubmit={event=>{event.preventDefault();void reopen();}}>
    <label className="block text-sm">Reason for reopening<textarea autoFocus required maxLength={500} disabled={busy} value={reason} onChange={event=>{setReason(event.target.value);requestId.current=crypto.randomUUID();}} className="mt-1 w-full bg-black border border-white/30 p-2"/></label>
    {error && <p role="alert" className="my-2 text-red-400">{error}</p>}
    <div className="grid grid-cols-2 gap-2 mt-4"><button type="submit" className="btn-secondary min-h-11 p-2" disabled={busy || !reason.trim()}>{busy?'Reopening…':`Reopen step ${target.index+1}`}</button><button type="button" className="btn-secondary min-h-11 p-2" disabled={busy} onClick={()=>setTarget(null)}>Cancel</button></div>
   </form>
 </dialog>}
 </>;
}
interface TurnProps {currentStep:VetoStep|null;teamAName:string;teamBName:string;isMyTurn:boolean;timeRemaining?:number;}
export function TurnIndicator({currentStep,teamAName,teamBName,isMyTurn}:TurnProps) {
 if(!currentStep)return null;
 const team=currentStep.actor==='team_a'?teamAName:currentStep.actor==='team_b'?teamBName:'System';
 return <p className="text-sm text-white/80">{isMyTurn?'Your turn':'Waiting for'} · <strong>{team}</strong> · {currentStep.action}</p>;
}
