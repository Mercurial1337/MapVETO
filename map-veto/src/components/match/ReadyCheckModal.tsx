'use client';
import {useState} from 'react';
import type {VetoActor} from '@/types';
interface ReadyCheckModalProps {
 isOpen:boolean;teamAName:string;teamBName:string;teamAReady:boolean;teamBReady:boolean;
 userRole?:VetoActor|'observer'|'admin'|'referee'|null;onReady:()=>Promise<boolean|void>;inline?:boolean;
}
export function ReadyCheckModal({isOpen,teamAName,teamBName,teamAReady,teamBReady,userRole,onReady,inline=false}:ReadyCheckModalProps) {
 const [busy,setBusy]=useState(false);
 if(!isOpen)return null;
 const player=userRole==='team_a'||userRole==='team_b',ready=userRole==='team_a'?teamAReady:teamBReady;
 async function checkIn(){if(busy)return;setBusy(true);try{await onReady();}finally{setBusy(false);}}
 return <div className={inline?'w-full':'fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 overflow-y-auto'}>
  <section role={inline?'region':'dialog'} aria-modal={inline?undefined:true} aria-labelledby="ready-check-title" className={`match-panel space-y-4 ${inline?'':'w-full max-w-lg max-h-[calc(100dvh-2rem)] overflow-y-auto'}`}>
   <div><h2 id="ready-check-title" className="text-lg font-semibold">Team check-in</h2><p className="text-sm text-white/60 mt-1">Both teams must check in before the veto begins.</p></div>
   <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
    {[{name:teamAName,ready:teamAReady,label:'Team A'},{name:teamBName,ready:teamBReady,label:'Team B'}].map(team=><div key={team.label} className="border border-white/15 rounded p-3 flex items-center justify-between gap-3 min-w-0"><div className="min-w-0"><p className="font-semibold break-words">{team.name}</p><p className="text-xs text-white/50 mt-1">{team.label}</p></div><span className={`shrink-0 text-sm ${team.ready?'text-green-300':'text-white/60'}`}>{team.ready?'Ready':'Waiting'}</span></div>)}
   </div>
   {player&&!ready?<button className="btn-primary min-h-11 px-5 py-2 text-sm" disabled={busy} onClick={()=>void checkIn()}>{busy?'Confirming…':'Check In'}</button>:<p className="text-sm text-white/60">{player?'Waiting for opponent…':'Waiting for teams to check in…'}</p>}
  </section>
 </div>;
}
