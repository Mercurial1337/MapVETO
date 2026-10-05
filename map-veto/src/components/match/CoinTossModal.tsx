'use client';
import { useState } from 'react';
import type { VetoActor } from '@/types';
interface Props {
 isOpen: boolean; teamAName: string; teamBName: string; isAdmin?: boolean;
 winner?: VetoActor | null; isSeeded?: boolean; userRole?: VetoActor | 'observer' | 'admin' | 'referee' | null;
 onFlip?: (forcedWinner?: VetoActor) => Promise<VetoActor | null>;
 onAnimationComplete?: () => void; coinImageA?: string | null; coinImageB?: string | null;
}
export function CoinTossModal({isOpen,teamAName,teamBName,isAdmin,onFlip}: Props) {
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 if(!isOpen) return null;
 async function flip(winner?: VetoActor) {
  if(!isAdmin || busy || !onFlip) return;
  setBusy(true); setError('');
  try { if(!await onFlip(winner)) setError('Could not complete the toss. Please try again.'); }
  finally {setBusy(false);}
 }
 return <div className="fixed inset-0 z-40 bg-black/80 flex items-center justify-center p-4">
  <section role="dialog" aria-modal="true" aria-labelledby="coin-title" className="w-full max-w-md bg-[#18181b] border border-white/20 p-6 rounded">
   <h2 id="coin-title" className="text-xl font-bold mb-3">Coin toss</h2>
   <p className="mb-4 text-white/70">The winner chooses Team A or Team B.</p>
   {error && <p role="alert" className="text-red-400 mb-3">{error}</p>}
   {isAdmin ? <button className="btn-primary px-4 py-2" disabled={busy} onClick={()=>flip()}>{busy?'Submitting…':'Flip coin'}</button> : <p>Both teams are ready. Waiting for an administrator to flip the coin.</p>}
   {isAdmin && <div className="mt-4 flex gap-2"><button disabled={busy} className="btn-secondary p-2" onClick={()=>flip('team_a')}>Force {teamAName}</button><button disabled={busy} className="btn-secondary p-2" onClick={()=>flip('team_b')}>Force {teamBName}</button></div>}
  </section>
 </div>;
}
