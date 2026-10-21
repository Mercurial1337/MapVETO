'use client';
import {useEffect,useState} from 'react';
import {createClient,getSessionUser} from '@/lib/supabase/client';
import {isSuperAdmin} from '@/lib/auth/superAdminRole';

// Super admin only: create platform accounts. Adding them to a tournament happens from the event page.
export default function AccountsPage() {
 const [allowed,setAllowed]=useState<boolean|null>(null),[busy,setBusy]=useState(false);
 const [form,setForm]=useState({email:'',password:''}),[error,setError]=useState(''),[message,setMessage]=useState('');
 const [secret,setSecret]=useState<{email:string;password:string}|null>(null);
 useEffect(()=>{void getSessionUser(createClient()).then(user=>setAllowed(isSuperAdmin(user)));},[]);
 async function create(e:React.FormEvent) {
  e.preventDefault();if(busy)return;setBusy(true);setError('');setMessage('');
  try {
   const response=await fetch('/api/super-admin/accounts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(form)});const data=await response.json();
   if(!response.ok){setError(data.error || 'Request failed');return;}
   setMessage(`${data.account.email} created. It can sign in now.`);
   setSecret(data.password?{email:data.account.email,password:data.password}:null);setForm({email:'',password:''});
  } catch {setError('Connection failed. Please try again.');}
  finally {setBusy(false);}
 }
 if(allowed===null)return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-white/20 border-t-purple-500 rounded-full animate-spin"/></div>;
 if(!allowed)return <main className="max-w-xl"><section className="match-panel"><h1 className="text-xl font-bold mb-2">Accounts</h1><p className="text-white/70">Only the super admin account can create platform accounts.</p></section></main>;
 return <main className="max-w-3xl space-y-5 min-w-0">
  <div><h1 className="brand-title text-2xl md:text-3xl">Accounts</h1><p className="text-sm text-white/70 mt-2">Create an account and send its email and password to the account holder. To give it access to a tournament, add it by email from that tournament’s event page.</p></div>
  {error && <p role="alert" className="border border-red-800 rounded px-4 py-2 text-red-300 break-words">{error}</p>}
  {message && <p role="status" className="border border-green-800 rounded px-4 py-2 text-green-300 break-words">{message}</p>}
  {secret && <section aria-label="New password" className="match-panel">
   <div className="panel-head"><h2>Password for {secret.email}</h2><button className="text-xs underline" onClick={()=>setSecret(null)}>Done</button></div>
   <p className="text-sm text-white/70 mb-2">Copy it now and send it to the account holder privately. It is not shown again.</p>
   <div className="flex flex-wrap items-center gap-2"><code className="match-input !w-auto flex-1 font-mono break-all select-all">{secret.password}</code><button className="btn-primary px-4 py-2 min-h-11" onClick={()=>void navigator.clipboard?.writeText(secret.password).then(()=>setMessage('Password copied.'),()=>setError('Copy failed. Select the password and copy it manually.'))}>Copy</button></div>
  </section>}
  <section aria-labelledby="create-account" className="match-panel">
   <div className="panel-head"><h2 id="create-account">Create account</h2></div>
   <form onSubmit={create} className="grid grid-cols-1 md:grid-cols-2 gap-3">
    <label className="text-sm">Email<input type="email" required className="match-input mt-1 min-h-11" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} autoComplete="off"/></label>
    <label className="text-sm">Password <span className="text-white/50">(leave empty to generate one)</span><input type="text" minLength={10} maxLength={72} className="match-input mt-1 min-h-11 font-mono" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} autoComplete="new-password" spellCheck={false}/></label>
    <div className="md:col-span-2"><button className="btn-primary px-5 py-2 min-h-11" disabled={busy || !form.email.trim()}>{busy?'Creating…':'Create account'}</button></div>
   </form>
  </section>
 </main>;
}
