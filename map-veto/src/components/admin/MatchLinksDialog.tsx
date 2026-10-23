'use client';

import {useEffect, useRef, useState} from 'react';
import {copyText, matchLinkUrls, MATCH_LINK_ROLES} from '@/lib/clipboard';

type Role = typeof MATCH_LINK_ROLES[number];
interface Entry {role: Role; label: string; url: string;}
const DEFAULT_LABELS: Record<Role, string> = {team_a:'Team 1', team_b:'Team 2', observer:'Observer', admin:'Head Ref', referee:'Referee'};
const STYLES = {
 red: 'bg-red-500/5 border-red-500/10 text-red-400',
 blue: 'bg-blue-500/5 border-blue-500/10 text-blue-400',
 purple: 'bg-purple-500/5 border-purple-500/10 text-purple-400',
};

export function MatchLinksDialog({matchId, onClose}: {matchId: string; onClose: () => void}) {
 const dialog = useRef<HTMLDialogElement>(null);
 const [entries, setEntries] = useState<Entry[] | null>(null);
 const [error, setError] = useState('');
 const [copied, setCopied] = useState<Role | null>(null);
 useEffect(() => {
  dialog.current?.showModal();
  const controller = new AbortController();
  async function load() {
   try {
    const response = await fetch(`/api/matches/${matchId}`, {method:'POST', signal:controller.signal, cache:'no-store'});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not load match links.');
    const roles = data.staff_role === 'referee' ? ['team_a','team_b','referee'] as const : MATCH_LINK_ROLES;
    const urls = matchLinkUrls(data.links, window.location.origin, matchId, roles);
    if (!controller.signal.aborted) setEntries(roles.map(role => ({role, url:urls[role], label:role==='team_a'||role==='team_b' ? data.links[role].label || DEFAULT_LABELS[role] : DEFAULT_LABELS[role]})));
   } catch (cause) {
    if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not load match links.');
   }
  }
  void load();
  return () => controller.abort();
 }, [matchId]);
 async function copy(entry: Entry) {
  setError('');
  setCopied(null);
  try {await copyText(entry.url); setCopied(entry.role);}
  catch (cause) {setError(cause instanceof Error ? cause.message : 'Copy failed. Please try again.');}
 }
 return <dialog ref={dialog} aria-labelledby="match-links-title" onCancel={onClose} onClick={event=>{if(event.target===event.currentTarget)onClose();}} className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded border border-white/20 bg-[#1b1821] p-6 text-white backdrop:bg-black/80">
  <div onClick={event=>event.stopPropagation()}>
   <h3 id="match-links-title" className="mb-4 text-xl font-bold">Match Links</h3>
   {!entries && !error && <p role="status">Loading links…</p>}
   {error && <p role="alert" className="mb-3 text-sm text-red-300">{error}</p>}
   <div className="space-y-3">{entries?.map(entry=><div key={entry.role} className={`rounded-lg border p-3 ${STYLES[entry.role==='team_a'?'red':entry.role==='team_b'?'blue':'purple']}`}>
    <div className="flex items-center justify-between gap-3"><span className="min-w-0 break-words text-sm font-medium">{entry.label}</span><button type="button" aria-label={`Copy ${entry.label} link`} className="shrink-0 rounded bg-white/5 px-2 py-1 text-xs hover:bg-white/10" onClick={()=>void copy(entry)}>{copied===entry.role?'Copied':'Copy'}</button></div>
   </div>)}</div>
   <span role="status" className="sr-only">{copied ? `${entries?.find(entry=>entry.role===copied)?.label} link copied` : ''}</span>
   <button type="button" onClick={onClose} className="mt-4 w-full rounded-lg bg-white/10 py-2 text-white hover:bg-white/20">Close</button>
  </div>
 </dialog>;
}
