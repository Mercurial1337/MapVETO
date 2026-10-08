export interface BrowserTimeout {id:string;matchId:string;teamA:string;teamB:string;requestedBy:string;}
type TimeoutNotification=Pick<Notification,'close'|'onclick'|'onerror'>;
export function createTimeoutNotification(item:BrowserTimeout,reminder:boolean,onSelect:(item:BrowserTimeout)=>void,create:(title:string,options:NotificationOptions & {renotify:boolean})=>TimeoutNotification=(title,options)=>new Notification(title,options)):TimeoutNotification {
 const notification=create(`${reminder?'Timeout still open':'Timeout requested'}: ${item.requestedBy}`,{body:`${item.teamA} vs ${item.teamB}. Click to review and resolve the timeout.`,tag:'veto-timeout:'+item.id,requireInteraction:true,renotify:true,silent:false,icon:'/icon.png'});
 notification.onclick=()=>{onSelect(item);notification.close();};
 return notification;
}
interface AlertPort {
 permission:()=>string;now:()=>number;read:(key:string)=>string|null;write:(key:string,value:string)=>void;
 show:(item:BrowserTimeout,reminder:boolean)=>{close:()=>void};play:()=>void;
}
// Shared timestamps prevent match/dashboard tabs from issuing the same alert.
// Reminders keep running until the authoritative open-request list removes it.
export class BrowserTimeoutAlerts {
 private port:AlertPort;
 private active=new Map<string,{close:()=>void}>();
 private sent=new Map<string,number>();
 constructor(port:AlertPort){this.port=port;}
 sync(items:BrowserTimeout[]) {
  const open=new Set(items.map(item=>item.id));
  for(const [id,notification] of this.active)if(!open.has(id) || this.port.permission()!=='granted'){notification.close();this.active.delete(id);}
  if(this.port.permission()!=='granted')return;
  for(const item of items) {
   const key='veto-timeout-alert:'+item.id,now=this.port.now();let shared=0;
   try{shared=Number(this.port.read(key)) || 0;}catch{/* Private browsing may disable storage. */}
   const last=Math.max(shared,this.sent.get(item.id) || 0);
   if(last && now>=last && now-last<30000)continue;
   try {
    const notification=this.port.show(item,last>0);
    this.active.get(item.id)?.close();this.active.set(item.id,notification);this.sent.set(item.id,now);
    try{this.port.write(key,String(now));}catch{/* In-memory deduplication remains available. */}
    this.port.play();
   }catch{/* Unsupported/blocked notifications must never interrupt the veto. */}
  }
 }
 dispose(){for(const notification of this.active.values())notification.close();this.active.clear();}
}
