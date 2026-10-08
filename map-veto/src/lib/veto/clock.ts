// Anchor server UTC to a monotonic clock. Device clock skew and later wall-clock
// changes never affect the countdown. Compensate for network transit, not SQL time.
export class VetoClock {
 private anchor: {server:number;local:number}|null=null;
 private monotonic:()=>number;
 constructor(monotonic:()=>number=()=>performance.now()) {this.monotonic=monotonic;}
 synchronize(serverTime:number,sent:number,received:number,processingMs=0) {
  if(!Number.isFinite(serverTime) || received<sent || !Number.isFinite(processingMs))return false;
  this.anchor={server:serverTime+Math.max(0,received-sent-processingMs)/2,local:received};
  return true;
 }
 now():number|null {return this.anchor ? this.anchor.server+this.monotonic()-this.anchor.local : null;}
}
export function turnRemaining(clock:string,now:number|null):number|null {
 const start=Date.parse(clock);
 return now===null || !Number.isFinite(start)?null:Math.max(0,Math.min(60,Math.ceil((start+60000-now)/1000)));
}
export function nextTimerTick(clock:string,now:number):number {
 const left=Date.parse(clock)+60000-now;
 return left<=0?500:Math.max(10,Math.min(1000,left-(Math.ceil(left/1000)-1)*1000));
}
