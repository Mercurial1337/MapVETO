'use client';
import {useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {BrowserTimeoutAlerts,createTimeoutNotification,type BrowserTimeout} from '@/lib/veto/browserTimeoutAlerts';
import {useNotificationSound} from '@/hooks/useNotificationSound';
function permission():NotificationPermission|'unsupported' {
 return typeof window==='undefined' || !window.isSecureContext || !('Notification' in window)?'unsupported':Notification.permission;
}
// Tabs reading shared storage at the same instant could both alert. Holding a per-alert
// Web Lock for the tab's lifetime lets exactly one tab deliver it; storage covers later checks.
function claim(key:string):Promise<boolean> {
 if(!navigator.locks)return Promise.resolve(true);
 return new Promise(resolve=>{navigator.locks.request(key,{ifAvailable:true},lock=>{resolve(Boolean(lock));return lock?new Promise<void>(()=>{}):undefined;}).catch(()=>resolve(true));});
}
function subscribe(changed:()=>void){window.addEventListener('focus',changed);window.addEventListener('veto-notification-permission',changed);return()=>{window.removeEventListener('focus',changed);window.removeEventListener('veto-notification-permission',changed);};}
export function TimeoutBrowserAlerts({requests,onSelect}:{requests:BrowserTimeout[];onSelect:(item:BrowserTimeout)=>void}) {
 const current=useSyncExternalStore(subscribe,permission,()=> 'default' as const);
 const [error,setError]=useState('');
 const [requesting,setRequesting]=useState(false);
 const sound=useNotificationSound(current==='granted');
 const controller=useRef<BrowserTimeoutAlerts|null>(null),latest=useRef(requests);
 useEffect(()=>{
 const alerts=new BrowserTimeoutAlerts({permission,now:()=>Date.now(),read:key=>localStorage.getItem(key),write:(key,value)=>localStorage.setItem(key,value),show:(item,kind,count)=>{
  let notification:ReturnType<typeof createTimeoutNotification>|null=null,closed=false;
  void claim(`veto-timeout-alert:${kind}:${item.id}`).then(won=>{
   if(!won || closed)return;
   try{notification=createTimeoutNotification(item,kind,request=>{window.focus();onSelect(request);},undefined,count);}
   catch{setError('This browser could not display notifications. Try a desktop browser.');return;}
   notification.onerror=()=>setError('The browser could not display the alert. Check its notification settings.');
   sound('attention');
  });
  return {close:()=>{closed=true;notification?.close();}};
 }});
 controller.current=alerts;
 const timer=setInterval(()=>alerts.sync(latest.current),1000);
 return()=>{clearInterval(timer);alerts.dispose();controller.current=null;};
 },[sound,onSelect]);
 useEffect(()=>{latest.current=requests;controller.current?.sync(requests);},[requests,current,sound,onSelect]);
 async function enable(){if(requesting)return;setRequesting(true);setError('');try{await Notification.requestPermission();window.dispatchEvent(new Event('veto-notification-permission'));}catch{setError('Could not request notification permission. Check your browser settings.');}finally{setRequesting(false);}}
 return <div className="text-xs my-2">
  {current==='default'?<button disabled={requesting} className="btn-secondary min-h-11 p-2" onClick={()=>void enable()}>{requesting?'Respond to the browser permission prompt':'Enable timeout browser alerts'}</button>:<p>{current==='granted'?'Timeout browser alerts on · one reminder after 2 minutes if nobody acknowledges':current==='denied'?'Browser alerts blocked. Allow notifications in site settings.':'Browser notifications unavailable in this browser.'}</p>}
  {current==='granted' && <p className="text-white/60 mt-1">Keep a dashboard or staff match tab open.</p>}
  {error && <p role="alert" className="text-yellow-300 mt-1">{error}</p>}
 </div>;
}
