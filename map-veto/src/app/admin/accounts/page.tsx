'use client';
import {useCallback,useEffect,useState} from 'react';

type Role='owner'|'admin'|'referee';
interface Tournament {membership_id:string|null;event_id:string;role:Role}
interface Account {id:string;email:string;created_at:string;last_sign_in_at:string|null;super_admin:boolean;tournaments:Tournament[]}
interface EventOption {id:string;name:string}
const roleLabel=(role:Role)=>role==='owner'?'Owner':role==='referee'?'Referee':'Head Admin';

// Super admin only: create platform accounts and place them on tournaments directly.
export default function AccountsPage() {
 const [accounts,setAccounts]=useState<Account[]>([]),[events,setEvents]=useState<EventOption[]>([]);
 const [status,setStatus]=useState<'loading'|'ready'|'denied'|'error'>('loading'),[message,setMessage]=useState(''),[error,setError]=useState('');
 const [secret,setSecret]=useState<{email:string;password:string}|null>(null),[busy,setBusy]=useState(false);
 const [form,setForm]=useState({email:'',password:'',event_id:'',role:'admin'});
 const [assign,setAssign]=useState<Record<string,{event_id:string;role:string}>>({});
 const load=useCallback(async()=>{
  try {
   const response=await fetch('/api/super-admin/accounts',{cache:'no-store'});
   if(response.status===401 || response.status===403){setStatus('denied');return;}
   const data=await response.json();if(!response.ok)throw new Error(data.error);
   setAccounts(data.accounts);setEvents(data.events);setStatus('ready');
  } catch {setStatus('error');}
 },[]);
 useEffect(()=>{void load();},[load]);
 async function call(url:string,init:RequestInit,success:string) {
  if(busy)return null;setBusy(true);setError('');setMessage('');
  try {
   const response=await fetch(url,{...init,headers:{'Content-Type':'application/json'}});const data=await response.json();
   if(!response.ok){setError(data.error || 'Request failed');if(data.account_id)await load();return null;}
   setMessage(success);await load();return data;
  } catch {setError('Connection failed. Please try again.');return null;}
  finally {setBusy(false);}
 }
 async function create(e:React.FormEvent) {
  e.preventDefault();const email=form.email.trim();
  const data=await call('/api/super-admin/accounts',{method:'POST',body:JSON.stringify(form)},`${email} created${form.event_id?` and added to ${events.find(ev=>ev.id===form.event_id)?.name}`:''}.`);
  if(data){if(data.password)setSecret({email,password:data.password});setForm({email:'',password:'',event_id:form.event_id,role:form.role});}
 }
 async function resetPassword(account:Account) {
  if(!confirm(`Replace the password for ${account.email}? The current password stops working immediately.`))return;
  const data=await call('/api/super-admin/accounts',{method:'PATCH',body:JSON.stringify({user_id:account.id,action:'reset_password'})},`New password generated for ${account.email}.`);
  if(data?.password)setSecret({email:account.email,password:data.password});
 }
 const eventName=(id:string)=>events.find(e=>e.id===id)?.name || 'Unknown tournament';
 if(status==='loading')return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-white/20 border-t-purple-500 rounded-full"/></div>;
 if(status==='denied')return <main className="max-w-xl"><section className="match-panel"><h1 className="text-xl font-bold mb-2">Accounts</h1><p className="text-white/70">Only the super admin account can manage platform accounts.</p></section></main>;
 if(status==='error')return <main className="max-w-xl"><section className="match-panel"><p role="alert" className="text-red-300 mb-3">Accounts could not be loaded.</p><button className="btn-secondary px-4 py-2" onClick={()=>{setStatus('loading');void load();}}>Try again</button></section></main>;
 return <main className="max-w-5xl space-y-5 min-w-0">
  <div><h1 className="brand-title text-2xl md:text-3xl">Accounts</h1><p className="text-sm text-white/70 mt-2">Create staff accounts and add them to tournaments. New accounts can sign in immediately with the password shown.</p></div>
  {error && <p role="alert" className="border border-red-800 rounded px-4 py-2 text-red-300 break-words">{error}</p>}
  {message && <p role="status" className="border border-green-800 rounded px-4 py-2 text-green-300 break-words">{message}</p>}
  {secret && <section aria-label="New password" className="match-panel border-lime">
   <div className="panel-head"><h2>Password for {secret.email}</h2><button className="text-xs underline" onClick={()=>setSecret(null)}>Done</button></div>
   <p className="text-sm text-white/70 mb-2">Copy it now and send it to the account holder privately. It is not shown again.</p>
   <div className="flex flex-wrap items-center gap-2"><code className="match-input !w-auto flex-1 font-mono break-all select-all">{secret.password}</code><button className="btn-primary px-4 py-2 min-h-11" onClick={()=>void navigator.clipboard?.writeText(secret.password).then(()=>setMessage('Password copied.'),()=>setError('Copy failed. Select the password and copy it manually.'))}>Copy</button></div>
  </section>}
  <section aria-labelledby="create-account" className="match-panel">
   <div className="panel-head"><h2 id="create-account">Create account</h2></div>
   <form onSubmit={create} className="grid grid-cols-1 md:grid-cols-2 gap-3">
    <label className="text-sm">Email<input type="email" required className="match-input mt-1 min-h-11" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} autoComplete="off"/></label>
    <label className="text-sm">Password <span className="text-white/50">(leave empty to generate one)</span><input type="text" minLength={10} maxLength={72} className="match-input mt-1 min-h-11 font-mono" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} autoComplete="new-password" spellCheck={false}/></label>
    <label className="text-sm">Tournament <span className="text-white/50">(optional)</span><select className="match-input mt-1 min-h-11" value={form.event_id} onChange={e=>setForm({...form,event_id:e.target.value})}><option value="">Not yet</option>{events.map(ev=><option key={ev.id} value={ev.id}>{ev.name}</option>)}</select></label>
    <label className="text-sm">Role<select className="match-input mt-1 min-h-11" value={form.role} disabled={!form.event_id} onChange={e=>setForm({...form,role:e.target.value})}><option value="admin">Head Admin</option><option value="referee">Referee</option></select></label>
    <div className="md:col-span-2"><button className="btn-primary px-5 py-2 min-h-11" disabled={busy || !form.email.trim()}>{busy?'Saving…':'Create account'}</button></div>
   </form>
  </section>
  <section aria-labelledby="account-list" className="match-panel">
   <div className="panel-head"><h2 id="account-list">All accounts ({accounts.length})</h2></div>
   <ul className="divide-y divide-white/10">
    {accounts.map(account=>{const pick=assign[account.id] || {event_id:'',role:'admin'};return <li key={account.id} className="py-4 space-y-3 min-w-0">
     <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0"><p className="font-semibold break-all">{account.email}{account.super_admin && <span className="ml-2 text-xs px-2 py-0.5 rounded bg-lime text-black align-middle">Super admin</span>}</p>
       <p className="text-xs text-white/50 mt-1">Created {new Date(account.created_at).toLocaleDateString()} · {account.last_sign_in_at?`last signed in ${new Date(account.last_sign_in_at).toLocaleString()}`:'never signed in'}</p></div>
      <button className="btn-secondary px-3 py-2 text-sm" disabled={busy} onClick={()=>void resetPassword(account)}>Reset password</button>
     </div>
     {account.tournaments.length>0 ? <ul className="flex flex-wrap gap-2" aria-label={`Tournaments for ${account.email}`}>{account.tournaments.map(t=><li key={t.membership_id || 'owner-'+t.event_id} className="flex items-center gap-2 border border-white/15 rounded px-3 py-1 text-sm min-w-0">
      <span className="break-words">{eventName(t.event_id)} · <span className={t.role==='referee'?'text-team-b':'text-lime'}>{roleLabel(t.role)}</span></span>
      {t.membership_id && <button className="text-red-300 text-xs underline" disabled={busy} aria-label={`Remove ${account.email} from ${eventName(t.event_id)}`} onClick={()=>{if(confirm(`Remove ${account.email} from ${eventName(t.event_id)}?`))void call(`/api/super-admin/memberships?id=${t.membership_id}`,{method:'DELETE'},`${account.email} removed from ${eventName(t.event_id)}.`);}}>Remove</button>}
     </li>)}</ul> : <p className="text-sm text-white/50">Not on any tournament.</p>}
     {!account.super_admin && events.length>0 && <form className="flex flex-wrap gap-2" onSubmit={async e=>{e.preventDefault();if(await call('/api/super-admin/memberships',{method:'POST',body:JSON.stringify({user_id:account.id,...pick})},`${account.email} is now ${pick.role==='referee'?'Referee':'Head Admin'} on ${eventName(pick.event_id)}.`))setAssign({...assign,[account.id]:{event_id:'',role:pick.role}});}}>
      <select aria-label="Tournament" className="match-input !w-auto min-h-11 flex-1 min-w-[12rem]" value={pick.event_id} onChange={e=>setAssign({...assign,[account.id]:{...pick,event_id:e.target.value}})}><option value="">Add to tournament…</option>{events.map(ev=><option key={ev.id} value={ev.id}>{ev.name}</option>)}</select>
      <select aria-label="Role" className="match-input !w-auto min-h-11" value={pick.role} onChange={e=>setAssign({...assign,[account.id]:{...pick,role:e.target.value}})}><option value="admin">Head Admin</option><option value="referee">Referee</option></select>
      <button className="btn-secondary px-4 py-2 min-h-11" disabled={busy || !pick.event_id}>Add</button>
     </form>}
    </li>;})}
   </ul>
  </section>
 </main>;
}
