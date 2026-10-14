export interface BrowserTimeout {id:string;matchId:string;teamA:string;teamB:string;requestedBy:string;acknowledged:boolean;}
type TimeoutNotification=Pick<Notification,'close'|'onclick'|'onerror'>;
export type AlertKind='new'|'reminder';
export const REMINDER_DELAY_MS=120000,REMINDER_GRACE_MS=90000;
export function createTimeoutNotification(item:BrowserTimeout,kind:AlertKind,onSelect:(item:BrowserTimeout)=>void,create:(title:string,options:NotificationOptions & {renotify:boolean})=>TimeoutNotification=(title,options)=>new Notification(title,options),count=1):TimeoutNotification {
 const title=count>1?`${count} timeout requests need attention`:`${kind==='reminder'?'Timeout not acknowledged':'Timeout requested'}: ${item.requestedBy}`;
 const body=count>1?`Including ${item.requestedBy} (${item.teamA} vs ${item.teamB}). Click to review and acknowledge.`:`${item.teamA} vs ${item.teamB}. Click to review and acknowledge the timeout.`;
 const notification=create(title,{body,tag:'veto-timeout:'+item.id,requireInteraction:true,renotify:true,silent:false,icon:'/icon.png'});
 notification.onclick=()=>{onSelect(item);notification.close();};
 return notification;
}
interface AlertPort {
 permission:()=>string;now:()=>number;read:(key:string)=>string|null;write:(key:string,value:string)=>void;
 // Delivers one alert (notification and sound) and returns a handle to close it.
 show:(item:BrowserTimeout,kind:AlertKind,count:number)=>{close:()=>void};
}
interface AlertRecord {first:number;reminded:boolean;}
// Each request alerts once, then reminds once after two minutes unless a staff member
// acknowledged it. Shared records keep dashboard and match tabs from repeating alerts.
export class BrowserTimeoutAlerts {
 private port:AlertPort;
 private active=new Map<string,{close:()=>void}>();
 private records=new Map<string,AlertRecord>();
 constructor(port:AlertPort){this.port=port;}
 private record(id:string):AlertRecord {
  const local=this.records.get(id);let shared:AlertRecord|null=null;
  try {
   const raw=this.port.read('veto-timeout-alert:'+id);
   // Earlier versions stored a timestamp and reminded every 30 seconds; treat those as reminded.
   if(raw)shared=/^\d+$/.test(raw)?{first:Number(raw),reminded:true}:JSON.parse(raw);
  } catch {/* Private browsing may disable storage. */}
  return {first:shared?.first || local?.first || 0,reminded:Boolean(shared?.reminded || local?.reminded)};
 }
 private save(id:string,record:AlertRecord){this.records.set(id,record);try{this.port.write('veto-timeout-alert:'+id,JSON.stringify(record));}catch{/* In-memory deduplication remains available. */}}
 private notify(items:BrowserTimeout[],kind:AlertKind) {
  try {
   const notification=this.port.show(items[0],kind,items.length);
   for(const item of items){this.active.get(item.id)?.close();this.active.set(item.id,notification);}
  } catch {/* Unsupported/blocked notifications must never interrupt the veto. */}
 }
 sync(items:BrowserTimeout[]) {
  const open=new Map(items.map(item=>[item.id,item])),granted=this.port.permission()==='granted';
  for(const [id,notification] of this.active)if(!granted || !open.has(id) || open.get(id)!.acknowledged){notification.close();this.active.delete(id);}
  if(!granted)return;
  const now=this.port.now(),fresh:BrowserTimeout[]=[];
  for(const item of items) {
   if(item.acknowledged)continue;
   const record=this.record(item.id);
   if(!record.first){fresh.push(item);continue;}
   if(!record.reminded && now-record.first>=REMINDER_DELAY_MS) {
    this.save(item.id,{...record,reminded:true});
    // A tab waking from sleep marks an overdue reminder as spent instead of replaying it.
    if(now-record.first<=REMINDER_DELAY_MS+REMINDER_GRACE_MS)this.notify([item],'reminder');
   }
  }
  if(fresh.length){for(const item of fresh)this.save(item.id,{first:now,reminded:false});this.notify(fresh,'new');}
 }
 dispose(){for(const notification of this.active.values())notification.close();this.active.clear();}
}
