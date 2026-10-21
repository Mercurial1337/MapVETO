'use client';
import { useEffect, useState } from 'react';
import { useCountdownSound } from '@/hooks/useCountdownSound';
import type { VetoStep } from '@/types';
import { useRealtime } from '@/lib/realtime';
import { turnRemaining,nextTimerTick } from '@/lib/veto/clock';
interface Props {
 currentStep: VetoStep | null; stateUpdatedAt: string; teamAName: string; teamBName: string;
 matchId?: string; token?: string; isInProgress: boolean; isComplete: boolean;
 isPaused?: boolean; pausedRemainingSeconds?: number | null;
 soundEnabled?: boolean;
}
export function TurnTimer({currentStep,stateUpdatedAt,teamAName,teamBName,matchId,token,isInProgress,isComplete,isPaused,pausedRemainingSeconds,soundEnabled=false}:Props) {
 const [remaining,setRemaining]=useState<number|null>(null);
 const {clock,clockReady,expireTurn}=useRealtime();
 const {tick:playTick,stop:stopSound}=useCountdownSound(soundEnabled);
 const actorName=currentStep?.actor==='team_a'?teamAName:teamBName;
 useEffect(()=>{
  stopSound();
  if(!isInProgress || isComplete || !currentStep || !stateUpdatedAt) return;
  if(isPaused) {setRemaining(Math.ceil(pausedRemainingSeconds ?? 60));return;}
  let cancelled=false, pending=false, retryAt=0,timer:ReturnType<typeof setTimeout>;
  const tick=async()=>{
   const now=clockReady?clock.now():null;
   const seconds=turnRemaining(stateUpdatedAt,now);
   setRemaining(seconds);
   if(seconds!==null)playTick(stateUpdatedAt,seconds);
   if(seconds===0 && !pending && performance.now()>=retryAt && matchId && token) {
    pending=true;
    try {
     await expireTurn(stateUpdatedAt);
    } catch { /* retry until authoritative state advances */ }
    finally {if(!cancelled){pending=false;retryAt=performance.now()+500;}}
   }
  };
  const run=()=>{if(cancelled)return;void tick();const now=clock.now();timer=setTimeout(run,now===null?100:nextTimerTick(stateUpdatedAt,now));};
  run();
  const recover=()=>{if(document.visibilityState==='visible'){clearTimeout(timer);run();}};
  document.addEventListener('visibilitychange',recover);window.addEventListener('focus',recover);
  return ()=>{cancelled=true;clearTimeout(timer);document.removeEventListener('visibilitychange',recover);window.removeEventListener('focus',recover);stopSound();};
 },[currentStep,stateUpdatedAt,matchId,token,isInProgress,isComplete,isPaused,pausedRemainingSeconds,actorName,playTick,stopSound,clock,clockReady,expireTurn]);
 if(!currentStep || !isInProgress || isComplete) return null;
 return <TimerBox label={`${actorName} · ${currentStep.description || currentStep.action}`} remaining={remaining} total={60} paused={isPaused}/>;
}
// Green for the first half, yellow for the next quarter, red for the final quarter
// (the last 15 s of a 60 s turn, when the ticks start). Shared with the check-in countdown.
export function TimerBox({label,remaining,total,paused}:{label:string;remaining:number|null;total:number;paused?:boolean}) {
 const level=remaining===null || paused?'idle':remaining>total/2?'safe':remaining>total/4?'warn':'danger';
 const tone={idle:'#a1a1aa',safe:'#22c55e',warn:'#eab308',danger:'#ef4444'}[level];
 const fraction=remaining===null?1:Math.max(0,Math.min(1,remaining/total));
 return <div role="status" className="timer-box max-w-full w-[min(100%,28rem)] rounded border bg-[#18181b] px-4 py-2 text-sm" style={{borderColor:tone}}>
  <div className="flex flex-wrap items-center justify-center gap-3">
   <span className="min-w-0 break-words">{label}</span>
   <strong className="shrink-0 font-mono tabular-nums text-xl" style={{color:tone}}>{paused?'Paused':remaining===null?'Syncing…':`${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,'0')}`}</strong>
   {level==='danger' && <span className="text-sm font-semibold" style={{color:tone}}>Time is running out</span>}
  </div>
  <div className="mt-2 h-2 rounded-full bg-white/10 overflow-hidden" aria-hidden="true"><div className="h-full rounded-full transition-[width] duration-1000 ease-linear" style={{width:`${fraction*100}%`,background:tone}}/></div>
 </div>;
}
