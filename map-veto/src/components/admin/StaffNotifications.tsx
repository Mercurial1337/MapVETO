'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {toast} from 'sonner';
import {createClient} from '@/lib/supabase/client';

interface Completion {id:string;team_a_name:string;team_b_name:string;completed_at:string;}
export function StaffNotifications() {
    const [open,setOpen]=useState(false),[items,setItems]=useState<Completion[]>([]),[error,setError]=useState(''),[opening,setOpening]=useState('');
    const router=useRouter(),seen=useRef(new Set<string>()),initialized=useRef(false);
    const refresh=useCallback(async () => {
        try {
            const response=await fetch('/api/admin/notifications');
            if (!response.ok) throw new Error('Could not load staff notifications.');
            const data:{notifications:Completion[];eventIds:string[];userId:string}=await response.json();
            for (const item of data.notifications) {
                const key=item.id+':'+item.completed_at;
                if (initialized.current && !seen.current.has(key)) toast.success(`${item.team_a_name} vs ${item.team_b_name}: veto complete. Record the match start when play begins.`);
                seen.current.add(key);
            }
            initialized.current=true;setItems(data.notifications);setError('');
            return data;
        } catch {setError('Could not load staff notifications. Open again to retry.');}
    },[]);
    useEffect(() => {
        const db=createClient();
        let stopped=false,channel:ReturnType<typeof db.channel>|undefined,timer:ReturnType<typeof setTimeout>|undefined;
        const schedule=() => {if(!stopped && !timer)timer=setTimeout(()=>{timer=undefined;void refresh();},150);};
        void refresh().then(data => {
            if (!data || stopped) return;
            channel=db.channel('staff-completions:'+data.userId).on('postgres_changes',{event:'UPDATE',schema:'public',table:'matches',filter:`created_by=eq.${data.userId}`},schedule);
            for(let i=0;i<data.eventIds.length;i+=100) channel.on('postgres_changes',{event:'UPDATE',schema:'public',table:'matches',filter:`event_id=in.(${data.eventIds.slice(i,i+100).join(',')})`},schedule);
            channel.subscribe(status=>{if(status==='SUBSCRIBED')schedule();});
        });
        const recover=()=>{if(document.visibilityState==='visible')schedule();};
        window.addEventListener('focus',recover);document.addEventListener('visibilitychange',recover);
        return () => {stopped=true;clearTimeout(timer);if(channel)void db.removeChannel(channel);window.removeEventListener('focus',recover);document.removeEventListener('visibilitychange',recover);};
    },[refresh]);
    async function view(item:Completion) {
        if(opening)return;
        setOpening(item.id);
        try {
            const response=await fetch(`/api/matches/${item.id}`,{method:'POST'});
            const data=await response.json();
            if(!response.ok)throw new Error(data.error);
            const token=data.links?.[data.staff_role]?.token;
            if(!token)throw new Error('Staff link unavailable');
            router.push(`/match/${item.id}?token=${encodeURIComponent(token)}`);
        } catch {setError('Could not open the match. Please retry.');}
        finally {setOpening('');}
    }
    return <div className="relative">
        <button className="btn-secondary px-3 py-2 text-sm" aria-expanded={open} onClick={()=>{setOpen(!open);if(!open)void refresh();}}>Notifications</button>
        {open && <section aria-label="Staff notifications" className="absolute right-0 top-full mt-2 z-50 w-80 max-w-[90vw] max-h-[70vh] overflow-auto border border-white/30 bg-[#18181b] p-3 rounded">
            <h2 className="font-semibold">Completed vetos</h2><p className="text-sm text-white/70 mb-3">Record the match start when play begins. Veto completion is not the match start time.</p>
            {error && <p role="alert">{error}</p>}
            {!items.length && !error && <p className="text-sm">No completed vetos yet.</p>}
            <ul className="space-y-2">{items.map(item=><li key={item.id} className="border-t border-white/20 pt-2"><p>{item.team_a_name} vs {item.team_b_name}</p><p className="text-sm text-white/70">Veto completed {new Date(item.completed_at).toLocaleString()}</p><button disabled={Boolean(opening)} className="text-sm underline mt-1" onClick={()=>void view(item)}>View veto</button></li>)}</ul>
        </section>}
    </div>;
}
