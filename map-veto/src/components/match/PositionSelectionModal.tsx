'use client';
import { useState } from 'react';
import type { VetoActor } from '@/types';
import { TurnTimer } from './TurnTimer';
import { useRealtime } from '@/lib/realtime';
interface Props {
 isOpen:boolean;teamAName:string;teamBName:string;coinTossWinner:VetoActor|null;
 userRole:'team_a'|'team_b'|'observer'|'admin'|'referee'|null;token:string;matchId:string;
 isSeeded?:boolean;onComplete?:()=>void;turnStartedAt?:string;isPaused?:boolean;pausedRemainingSeconds?:number|null;
}
const positionStep={step:-1,action:'side' as const,actor:'team_a' as const,description:'Choose Team A or Team B'};
export function PositionSelectionModal({isOpen,teamAName,teamBName,coinTossWinner,userRole,token,matchId,isSeeded,onComplete,turnStartedAt,isPaused,pausedRemainingSeconds}:Props) {
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const {refresh}=useRealtime();
 if(!isOpen) return null;
 const winnerName=coinTossWinner==='team_a'?teamAName:teamBName;
 async function choose(first:boolean) {
  if(busy || isPaused) return;
  setBusy(true);setError('');
  try {
   const response=await fetch('/api/veto/position-choice',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({match_id:matchId,token,pick_first:first})});
   const data=await response.json();
   if(!response.ok) {setError(data.error || 'Choice failed');return;}
   await refresh();onComplete?.();
  } catch {setError('Connection failed. Please try again.');}
  finally {setBusy(false);}
 }
 return <div className="fixed inset-0 z-40 bg-black/80 flex items-center justify-center p-4">
  <section role="dialog" aria-modal="true" aria-labelledby="position-title" className="w-full max-w-lg bg-[#18181b] border border-white/20 p-6 rounded">
   <h2 id="position-title" className="text-xl font-bold mb-3">{winnerName} chooses Team A or Team B</h2>
   <p className="mb-4 text-white/70">{isSeeded?'Higher seed':'Coin toss winner'} · confirm your role within 60 seconds.</p>
   <TurnTimer soundEnabled={userRole==='team_a' || userRole==='team_b'} currentStep={positionStep} stateUpdatedAt={turnStartedAt || ''} teamAName={winnerName} teamBName={winnerName} matchId={matchId} token={token} isInProgress={isOpen} isComplete={false} isPaused={isPaused} pausedRemainingSeconds={pausedRemainingSeconds}/>
   {error && <p role="alert" className="text-red-400 mt-3">{error}</p>}
   {userRole===coinTossWinner ? <div className="flex gap-3 mt-4"><button disabled={busy || isPaused} className="btn-primary px-4 py-2" onClick={()=>choose(true)}>Confirm Team A</button><button disabled={busy || isPaused} className="btn-secondary px-4 py-2" onClick={()=>choose(false)}>Confirm Team B</button></div> : <p className="mt-4">Waiting for {winnerName} to choose.</p>}
  </section>
 </div>;
}
