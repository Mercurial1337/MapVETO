'use client';
import {useState} from 'react';
import {useRealtime} from '@/lib/realtime';

// Shown instead of any match content until the server accepts this team link's password.
export function TeamPasswordScreen() {
 const {unlock,match}=useRealtime();
 const [password,setPassword]=useState(''),[visible,setVisible]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function submit() {
  if(busy || !password)return;
  setBusy(true);setError('');
  // On success this screen unmounts; if the follow-up snapshot failed it stays usable for a retry.
  const failure=await unlock(password);
  setError(failure || '');setBusy(false);
 }
 return <main className="min-h-screen flex items-center justify-center px-4 py-8">
  <section aria-labelledby="team-password-title" className="match-panel w-full max-w-sm">
   <h1 id="team-password-title" className="text-xl font-bold mb-2">Team password</h1>
   <p className="text-sm text-white/70 mb-4">{match?'Your access expired or the password was changed. Enter the current password for your team link.':'Enter the password your organizer supplied for your team link.'}</p>
   <form onSubmit={e=>{e.preventDefault();void submit();}} aria-busy={busy}>
    <label htmlFor="team-password" className="block text-sm">Password</label>
    <input id="team-password" type={visible?'text':'password'} autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={256} required autoFocus
     className="match-input min-h-11 mt-1" value={password} disabled={busy} aria-invalid={Boolean(error)} aria-describedby={error?'team-password-error':undefined} onChange={e=>{setPassword(e.target.value);setError('');}}/>
    <label className="flex items-center gap-2 min-h-11 text-sm text-white/70"><input type="checkbox" className="h-5 w-5" checked={visible} onChange={e=>setVisible(e.target.checked)}/>Show password</label>
    {error && <p id="team-password-error" role="alert" className="text-red-300 text-sm mb-3 break-words">{error}</p>}
    <button className="btn-primary min-h-11 w-full px-4 py-2" disabled={busy || !password}>{busy?'Checking…':'Open match'}</button>
   </form>
   <p className="text-xs text-white/60 mt-4">Passwords are case-sensitive. After several incorrect attempts this link is paused for a few minutes.</p>
  </section>
 </main>;
}
