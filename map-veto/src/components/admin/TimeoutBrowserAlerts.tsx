'use client';
import {useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {BrowserTimeoutAlerts,createTimeoutNotification,type BrowserTimeout} from '@/lib/veto/browserTimeoutAlerts';
import {useNotificationSound} from '@/hooks/useNotificationSound';
function permission():NotificationPermission|'unsupported' {
 return typeof window==='undefined' || !window.isSecureContext || !('Notification' in window)?'unsupported':Notification.permission;
}
function subscribe(changed:()=>void){window.addEventListener('focus',changed);window.addEventListener('veto-notification-permission',changed);return()=>{window.removeEventListener('focus',changed);window.removeEventListener('veto-notification-permission',changed);};}
export function TimeoutBrowserAlerts({requests,onSelect}:{requests:BrowserTimeout[];onSelect:(item:BrowserTimeout)=>void}) {
 const current=useSyncExternalStore(subscribe,permission,()=> 'default' as const);
 const [error,setError]=useState('');
 const [requesting,setRequesting]=useState(false);
 const sound=useNotificationSound(current==='granted');
 const controller=useRef<BrowserTimeoutAlerts|null>(null),latest=useRef(requests);
 useEffect(()=>{
 const alerts=new BrowserTimeoutAlerts({permission,now:()=>Date.now(),read:key=>localStorage.getItem(key),write:(key,value)=>localStorage.setItem(key,value),play:()=>sound('attention'),show:(item,reminder)=>{
  let notification:ReturnType<typeof createTimeoutNotification>;
  try{notification=createTimeoutNotification(item,reminder,request=>{window.focus();onSelect(request);});}
  catch(error){setError('This browser could not display notifications. Try a desktop browser.');throw error;}
  notification.onerror=()=>setError('The browser could not display the alert. Check its notification settings.');
  return notification;
 }});
 controller.current=alerts;
 const timer=setInterval(()=>alerts.sync(latest.current),1000);
 return()=>{clearInterval(timer);alerts.dispose();controller.current=null;};
 },[sound,onSelect]);
 useEffect(()=>{latest.current=requests;controller.current?.sync(requests);},[requests,current,sound,onSelect]);
 async function enable(){if(requesting)return;setRequesting(true);setError('');try{await Notification.requestPermission();window.dispatchEvent(new Event('veto-notification-permission'));}catch{setError('Could not request notification permission. Check your browser settings.');}finally{setRequesting(false);}}
 return <div className="text-xs my-2">
  {current==='default'?<button disabled={requesting} className="btn-secondary p-2" onClick={()=>void enable()}>{requesting?'Respond to the browser permission prompt':'Enable timeout browser alerts'}</button>:<p>{current==='granted'?'Timeout browser alerts on · reminders every 30 seconds':current==='denied'?'Browser alerts blocked. Allow notifications in site settings.':'Browser notifications unavailable in this browser.'}</p>}
  {current==='granted' && <p className="text-white/60 mt-1">Keep a dashboard or staff match tab open.</p>}
  {error && <p role="alert" className="text-yellow-300 mt-1">{error}</p>}
 </div>;
}
