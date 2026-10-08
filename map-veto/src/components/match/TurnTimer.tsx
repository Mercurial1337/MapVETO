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
 return <div role="status" className="border border-white/20 bg-[#18181b] px-4 py-2 rounded flex items-center gap-3">
  <span>{actorName} · {currentStep.description || currentStep.action}</span>
  <strong className={`font-mono tabular-nums ${remaining!==null && remaining<=15?'text-yellow-400':''}`}>{isPaused?'Paused':remaining===null?'Syncing…':`${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,'0')}`}</strong>
  {remaining!==null && remaining<=15 && !isPaused && <span className="text-yellow-400 text-sm">Time is running out</span>}
 </div>;
}
