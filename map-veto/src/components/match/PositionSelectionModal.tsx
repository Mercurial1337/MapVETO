'use client';
import { useState } from 'react';
import type { VetoActor } from '@/types';
import { TurnTimer } from './TurnTimer';
import { useRealtime } from '@/lib/realtime';
interface Props {
 isOpen:boolean;teamAName:string;teamBName:string;coinTossWinner:VetoActor|null;
 userRole:'team_a'|'team_b'|'observer'|'admin'|'referee'|null;token:string;matchId:string;
 isSeeded?:boolean;onComplete?:()=>void;turnStartedAt?:string;isPaused?:boolean;pausedRemainingSeconds?:number|null;inline?:boolean;
}
const positionStep={step:-1,action:'side' as const,actor:'team_a' as const,description:'Choose Team A or Team B'};
export function PositionSelectionModal({isOpen,teamAName,teamBName,coinTossWinner,userRole,token,matchId,isSeeded,onComplete,turnStartedAt,isPaused,pausedRemainingSeconds,inline=false}:Props) {
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
 return <div className={inline?'w-full':'fixed inset-0 z-40 bg-black/80 flex items-center justify-center p-4 overflow-y-auto'}>
  <section role={inline?'region':'dialog'} aria-modal={inline?undefined:true} aria-labelledby="position-title" className={`match-panel ${inline?'':'w-full max-w-lg max-h-[calc(100dvh-2rem)] overflow-y-auto'}`}>
   <h2 id="position-title" className="text-lg font-semibold mb-3 break-words">{winnerName} chooses Team A or Team B</h2>
   <p className="mb-4 text-white/70">{isSeeded?'Higher seed':'Coin toss winner'} · confirm your role within 60 seconds.</p>
   <TurnTimer soundEnabled={userRole==='team_a' || userRole==='team_b'} currentStep={positionStep} stateUpdatedAt={turnStartedAt || ''} teamAName={winnerName} teamBName={winnerName} matchId={matchId} token={token} isInProgress={isOpen} isComplete={false} isPaused={isPaused} pausedRemainingSeconds={pausedRemainingSeconds}/>
   {error && <p role="alert" className="text-red-400 mt-3">{error}</p>}
   {userRole===coinTossWinner ? <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4"><button disabled={busy || isPaused} className="btn-primary min-h-11 px-4 py-2" onClick={()=>choose(true)}>Confirm Team A</button><button disabled={busy || isPaused} className="btn-secondary min-h-11 px-4 py-2" onClick={()=>choose(false)}>Confirm Team B</button></div> : <p className="mt-4 text-sm text-white/70 break-words">Waiting for {winnerName} to choose.</p>}
  </section>
 </div>;
}
