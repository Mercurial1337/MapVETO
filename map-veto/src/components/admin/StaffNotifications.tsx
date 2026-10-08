'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {toast} from 'sonner';
import {createClient} from '@/lib/supabase/client';
import {TimeoutBrowserAlerts} from './TimeoutBrowserAlerts';
import type {BrowserTimeout} from '@/lib/veto/browserTimeoutAlerts';

interface Completion {id:string;team_a_name:string;team_b_name:string;completed_at:string;}
interface StaffTimeout extends BrowserTimeout {reason:string;createdAt:string;}
export function StaffNotifications() {
    const [open,setOpen]=useState(false),[items,setItems]=useState<Completion[]>([]),[error,setError]=useState(''),[opening,setOpening]=useState('');
    const router=useRouter(),seen=useRef(new Set<string>()),initialized=useRef(false);
    const [timeouts,setTimeouts]=useState<StaffTimeout[]>([]);
    const requestVersion=useRef(0);
    const refresh=useCallback(async () => {
        const version=++requestVersion.current;
        try {
            const response=await fetch('/api/admin/notifications');
            if (!response.ok) throw new Error('Could not load staff notifications.');
            const data:{notifications:Completion[];timeouts:StaffTimeout[];eventIds:string[];userId:string}=await response.json();
            if(version!==requestVersion.current)return data;
            for (const item of data.notifications) {
                const key=item.id+':'+item.completed_at;
                if (initialized.current && !seen.current.has(key)) toast.success(`${item.team_a_name} vs ${item.team_b_name}: veto complete. Record the match start when play begins.`);
                seen.current.add(key);
            }
            initialized.current=true;setItems(data.notifications);setTimeouts(data.timeouts);setError('');
            return data;
        } catch {setError('Could not load staff notifications. Open again to retry.');}
    },[]);
    useEffect(() => {
        const db=createClient();
        let stopped=false,channel:ReturnType<typeof db.channel>|undefined,timeoutChannel:ReturnType<typeof db.channel>|undefined,timer:ReturnType<typeof setTimeout>|undefined;
        const schedule=() => {if(!stopped && !timer)timer=setTimeout(()=>{timer=undefined;void refresh();},150);};
        void refresh().then(data => {
            if (!data || stopped) return;
            channel=db.channel('staff-completions:'+data.userId).on('postgres_changes',{event:'UPDATE',schema:'public',table:'matches',filter:`created_by=eq.${data.userId}`},schedule);
            for(let i=0;i<data.eventIds.length;i+=100) channel.on('postgres_changes',{event:'UPDATE',schema:'public',table:'matches',filter:`event_id=in.(${data.eventIds.slice(i,i+100).join(',')})`},schedule);
            channel.subscribe(status=>{if(status==='SUBSCRIBED')schedule();});
            timeoutChannel=db.channel('staff-timeouts:'+data.userId).on('broadcast',{event:'timeouts_changed'},schedule).subscribe(status=>{if(status==='SUBSCRIBED')schedule();});
        });
        const recover=()=>{if(document.visibilityState==='visible')schedule();};
        window.addEventListener('focus',recover);document.addEventListener('visibilitychange',recover);
        const recovery=setInterval(schedule,30000);
        return () => {stopped=true;clearTimeout(timer);clearInterval(recovery);if(channel)void db.removeChannel(channel);if(timeoutChannel)void db.removeChannel(timeoutChannel);window.removeEventListener('focus',recover);document.removeEventListener('visibilitychange',recover);};
    },[refresh]);
    const view=useCallback(async (item:{id:string},activity?:'timeouts') => {
        if(opening)return;
        setOpening(item.id);
        try {
            const response=await fetch(`/api/matches/${item.id}`,{method:'POST'});
            const data=await response.json();
            if(!response.ok)throw new Error(data.error);
            const token=data.links?.[data.staff_role]?.token;
            if(!token)throw new Error('Staff link unavailable');
            router.push(`/match/${item.id}?token=${encodeURIComponent(token)}${activity?'&activity=timeouts':''}`);
        } catch {setError('Could not open the match. Please retry.');}
        finally {setOpening('');}
    },[opening,router]);
    const openTimeout=useCallback((item:BrowserTimeout)=>{void view({id:item.matchId},'timeouts');},[view]);
    return <div className="relative">
        <button className="btn-secondary px-3 py-2 text-sm" aria-expanded={open} onClick={()=>{setOpen(!open);if(!open)void refresh();}}>Notifications{timeouts.length?` · ${timeouts.length} timeout${timeouts.length===1?'':'s'}`:''}</button>
        <TimeoutBrowserAlerts requests={timeouts} onSelect={openTimeout}/>
        {open && <section aria-label="Staff notifications" className="absolute right-0 top-full mt-2 z-50 w-80 max-w-[90vw] max-h-[70vh] overflow-auto border border-white/30 bg-[#18181b] p-3 rounded">
            <h2 className="font-semibold">Open timeouts</h2>
            {!timeouts.length && <p className="text-sm mb-3">No open timeouts.</p>}
            <ul className="space-y-2 mb-4">{timeouts.map(item=><li key={item.id} className="border-l-2 border-yellow-400 pl-2"><p>{item.teamA} vs {item.teamB}</p><p className="text-sm">{item.requestedBy}: {item.reason}</p><button disabled={Boolean(opening)} className="text-sm underline" onClick={()=>openTimeout(item)}>Review timeout</button></li>)}</ul>
            <h2 className="font-semibold">Completed vetos</h2><p className="text-sm text-white/70 mb-3">Record the match start when play begins. Veto completion is not the match start time.</p>
            {error && <p role="alert">{error}</p>}
            {!items.length && !error && <p className="text-sm">No completed vetos yet.</p>}
            <ul className="space-y-2">{items.map(item=><li key={item.id} className="border-t border-white/20 pt-2"><p>{item.team_a_name} vs {item.team_b_name}</p><p className="text-sm text-white/70">Veto completed {new Date(item.completed_at).toLocaleString()}</p><button disabled={Boolean(opening)} className="text-sm underline mt-1" onClick={()=>void view(item)}>View veto</button></li>)}</ul>
        </section>}
    </div>;
}
