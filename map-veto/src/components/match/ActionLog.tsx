'use client';
import { useState } from 'react';
import type { MatchLog } from '@/types';
import { formatLog } from '@/lib/veto/log';
interface Props {logs:MatchLog[];dbTeamAName:string;dbTeamBName:string;displayTeam1Name:string;displayTeam2Name:string;mapNames:Record<string,string>;}
export function ActionLog({logs,dbTeamAName,dbTeamBName,mapNames}:Props) {
 const [copied,setCopied]=useState(false),[error,setError]=useState('');
 const teams={team_a:dbTeamAName,team_b:dbTeamBName};
 const lines=logs.map(log=>formatLog(log,teams,mapNames));
 async function copy() {
  try {await navigator.clipboard.writeText(lines.join('\n'));setCopied(true);setTimeout(()=>setCopied(false),2000);}
  catch {setError('Clipboard unavailable. Use Download log instead.');}
 }
 function download() {
  const url=URL.createObjectURL(new Blob([lines.join('\n')],{type:'text/plain;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download='veto-action-log.txt';link.click();URL.revokeObjectURL(url);
 }
 return <div className="flex flex-col max-h-[480px]">
  <div className="flex gap-2 mb-3"><button className="btn-secondary px-2 py-1 text-xs" onClick={copy}>{copied?'Copied':'Copy log'}</button><button className="btn-secondary px-2 py-1 text-xs" onClick={download}>Download log</button></div>
  {error && <p role="alert">{error}</p>}
  <ol aria-label="Veto action history" className="overflow-y-auto space-y-3 text-sm">
   {logs.map((entry,i)=><li key={entry.id} className={entry.metadata?.superseded || entry.metadata?.previous_session?'text-white/50':entry.action_type==='admin_action'?'border-l-2 border-yellow-400 pl-3 text-yellow-200':'text-white/90'}><time className="block text-xs text-white/50" dateTime={entry.created_at}>{new Date(entry.created_at).toLocaleString(undefined,{hour12:false})}</time>{lines[i].split(' — ').slice(1).join(' — ')}</li>)}
  </ol>
  {!logs.length && <p className="text-white/60">No actions yet.</p>}
 </div>;
}
