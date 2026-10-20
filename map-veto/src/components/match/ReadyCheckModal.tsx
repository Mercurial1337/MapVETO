'use client';
import {useEffect,useState} from 'react';
import {useRealtime} from '@/lib/realtime';
import {formatVetoTime} from '@/lib/sheets/parse';
import type {VetoActor} from '@/types';
interface ReadyCheckModalProps {
 isOpen:boolean;teamAName:string;teamBName:string;teamAReady:boolean;teamBReady:boolean;
 userRole?:VetoActor|'observer'|'admin'|'referee'|null;onReady:()=>Promise<boolean|void>;inline?:boolean;
 scheduledAt?:string|null;
}
export function ReadyCheckModal({isOpen,teamAName,teamBName,teamAReady,teamBReady,userRole,onReady,inline=false,scheduledAt}:ReadyCheckModalProps) {
 const [busy,setBusy]=useState(false);
 const {clock,clockReady}=useRealtime();const [now,setNow]=useState<number|null>(null);
 useEffect(()=>{if(!isOpen || !scheduledAt)return;const timer=setInterval(()=>setNow(clockReady?clock.now():null),1000);return()=>clearInterval(timer);},[isOpen,scheduledAt,clock,clockReady]);
 if(!isOpen)return null;
 const player=userRole==='team_a'||userRole==='team_b',ready=userRole==='team_a'?teamAReady:teamBReady;
 const opens=scheduledAt?Date.parse(scheduledAt):null,notOpen=opens!==null && (now===null || now<opens),closed=opens!==null && now!==null && now>=opens+600000;
 async function checkIn(){if(busy)return;setBusy(true);try{await onReady();}finally{setBusy(false);}}
 return <div className={inline?'w-full':'fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 overflow-y-auto'}>
  <section role={inline?'region':'dialog'} aria-modal={inline?undefined:true} aria-labelledby="ready-check-title" className={`match-panel space-y-4 ${inline?'':'w-full max-w-lg max-h-[calc(100dvh-2rem)] overflow-y-auto'}`}>
   <div className="panel-head"><h2 id="ready-check-title">Team check-in</h2></div><p className="text-sm text-white/70 text-center">Both teams must check in before the veto begins.</p>
   {scheduledAt && <div className="border border-white/20 rounded p-3 text-sm space-y-2"><p>Check-in opens: <strong>{formatVetoTime(scheduledAt)}</strong></p><p>Deadline: <strong>{formatVetoTime(new Date(Date.parse(scheduledAt)+600000).toISOString())}</strong></p><p className="text-white/70">{notOpen?'Check-in has not opened yet.':closed?'The deadline has passed. Applying no-show rules…':'Check-in is open.'} Missing teams’ choices stay automatic until a Head Admin restarts the entire veto.</p></div>}
   <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
    {[{name:teamAName,ready:teamAReady,label:'Team A'},{name:teamBName,ready:teamBReady,label:'Team B'}].map(team=><div key={team.label} className="border border-white/15 rounded p-3 flex items-center justify-between gap-3 min-w-0"><div className="min-w-0"><p className="font-semibold break-words">{team.name}</p><p className={`text-xs font-bold uppercase tracking-wider mt-1 ${team.label==='Team A'?'text-team-a':'text-team-b'}`}>{team.label}</p></div><span className={`shrink-0 text-sm ${team.ready?'text-green-300':'text-white/60'}`}>{team.ready?'✓ Ready':'Waiting'}</span></div>)}
   </div>
   <div className="flex justify-center pt-1">{player&&!ready?<button className="btn-cta min-w-[min(100%,16rem)] text-base" disabled={busy||notOpen||closed} onClick={()=>void checkIn()}>{busy?'Confirming…':notOpen?'Check-in not open':closed?'Check-in closed':'Check In'}</button>:<p className="text-sm text-white/70 text-center">{player?'Waiting for opponent…':'Waiting for teams to check in…'}</p>}</div>
  </section>
 </div>;
}
