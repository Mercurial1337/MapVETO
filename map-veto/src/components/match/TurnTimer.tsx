'use client';
import { useEffect, useState } from 'react';
import { useCountdownSound } from '@/hooks/useCountdownSound';
import type { VetoStep } from '@/types';
interface Props {
 currentStep: VetoStep | null; stateUpdatedAt: string; teamAName: string; teamBName: string;
 matchId?: string; token?: string; isInProgress: boolean; isComplete: boolean;
 isPaused?: boolean; pausedRemainingSeconds?: number | null;
}
export function TurnTimer({currentStep,stateUpdatedAt,teamAName,teamBName,matchId,token,isInProgress,isComplete,isPaused,pausedRemainingSeconds}:Props) {
 const [remaining,setRemaining]=useState(60);
 const {tick:playTick,stop:stopSound}=useCountdownSound();
 const actorName=currentStep?.actor==='team_a'?teamAName:teamBName;
 useEffect(()=>{
  stopSound();
  if(!isInProgress || isComplete || !currentStep || !stateUpdatedAt) return;
  if(isPaused) {setRemaining(Math.ceil(pausedRemainingSeconds ?? 60));return;}
  let cancelled=false, pending=false, retryAt=0;
  const tick=async()=>{
   const seconds=Math.max(0,Math.ceil((Date.parse(stateUpdatedAt)+60000-Date.now())/1000));
   setRemaining(seconds);
   playTick(stateUpdatedAt,seconds);
   if(seconds===0 && !pending && Date.now()>=retryAt && matchId && token) {
    pending=true;
    try {
     await fetch('/api/veto/auto-action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({match_id:matchId,token,turn_started_at:stateUpdatedAt})});
    } catch { /* retry until authoritative state advances */ }
    finally {if(!cancelled){pending=false;retryAt=Date.now()+3000;}}
   }
  };
  void tick(); const interval=setInterval(tick,1000);
  return ()=>{cancelled=true;clearInterval(interval);stopSound();};
 },[currentStep,stateUpdatedAt,matchId,token,isInProgress,isComplete,isPaused,pausedRemainingSeconds,actorName,playTick,stopSound]);
 if(!currentStep || !isInProgress || isComplete) return null;
 return <div role="status" className="border border-white/20 bg-[#18181b] px-4 py-2 rounded flex items-center gap-3">
  <span>{actorName} · {currentStep.description || currentStep.action}</span>
  <strong className={`font-mono tabular-nums ${remaining<=15?'text-yellow-400':''}`}>{isPaused?'Paused':`${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,'0')}`}</strong>
  {remaining<=15 && !isPaused && <span className="text-yellow-400 text-sm">Time is running out</span>}
 </div>;
}
