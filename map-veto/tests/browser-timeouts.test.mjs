import assert from 'node:assert/strict';
import {BrowserTimeoutAlerts,createTimeoutNotification,REMINDER_DELAY_MS} from '../src/lib/veto/browserTimeoutAlerts.ts';
let now=1000,permission='default';const storage=new Map(),notifications=[];
const port={permission:()=>permission,now:()=>now,read:key=>storage.get(key)||null,write:(key,value)=>storage.set(key,value),show:(item,kind,count)=>{const notice={item,kind,count,closed:false,close(){this.closed=true;}};notifications.push(notice);return notice;}};
const item={id:'report-1',matchId:'match-1',teamA:'Alpha',teamB:'Beta',requestedBy:'Alpha',acknowledged:false};
const first=new BrowserTimeoutAlerts(port),otherTab=new BrowserTimeoutAlerts(port);
first.sync([item]);assert.equal(notifications.length,0);
permission='denied';first.sync([item]);assert.equal(notifications.length,0);
// One immediate alert, shared across dashboard and match tabs.
permission='granted';first.sync([item]);assert.equal(notifications.length,1);assert.equal(notifications[0].kind,'new');
otherTab.sync([item]);first.sync([item]);assert.equal(notifications.length,1);
// One reminder after two minutes without acknowledgment, then no repeats.
now+=REMINDER_DELAY_MS-1;first.sync([item]);otherTab.sync([item]);assert.equal(notifications.length,1);
now++;first.sync([item]);assert.equal(notifications.length,2);assert.equal(notifications[0].closed,true);assert.equal(notifications[1].kind,'reminder');
otherTab.sync([item]);for(let i=0;i<20;i++){now+=30000;first.sync([item]);otherTab.sync([item]);}assert.equal(notifications.length,2);
// Acknowledgment by any staff member closes the alert in every tab without resolving it.
first.sync([{...item,acknowledged:true}]);assert.equal(notifications[1].closed,true);
const acked={...item,id:'report-2',acknowledged:true};first.sync([acked]);now+=REMINDER_DELAY_MS;first.sync([acked]);assert.equal(notifications.length,2);
// An acknowledged request never reminds; a new request still alerts on its own.
const second={...item,id:'report-3'};first.sync([second]);assert.equal(notifications.length,3);
now+=60000;first.sync([{...second,acknowledged:true}]);now+=REMINDER_DELAY_MS;first.sync([{...second,acknowledged:true}]);assert.equal(notifications.length,3);assert.equal(notifications[2].closed,true);
// Resolution removes the request and closes its notification.
const third={...item,id:'report-4'};first.sync([third]);assert.equal(notifications.length,4);first.sync([]);assert.equal(notifications[3].closed,true);
// A tab returning from sleep does not replay an overdue reminder, and no other tab sends it later.
const sleeper={...item,id:'report-5'};first.sync([sleeper]);assert.equal(notifications.length,5);now+=10*60000;first.sync([sleeper]);otherTab.sync([sleeper]);assert.equal(notifications.length,5);
// Several requests seen at once produce one coalesced alert, not a burst.
const burst=['a','b','c'].map(id=>({...item,id:'burst-'+id,requestedBy:'Team '+id}));first.sync(burst);assert.equal(notifications.length,6);assert.equal(notifications[5].count,3);assert.equal(notifications[5].kind,'new');
otherTab.sync(burst);assert.equal(notifications.length,6);
// Records written by the earlier 30-second policy are treated as already reminded.
storage.set('veto-timeout-alert:legacy',String(now-1000));first.sync([{...item,id:'legacy'}]);now+=REMINDER_DELAY_MS;first.sync([{...item,id:'legacy'}]);assert.equal(notifications.length,6);
// Permission withdrawal closes alerts; in-site visibility does not depend on notifications.
permission='denied';first.sync(burst);assert.equal(notifications[5].closed,true);permission='granted';
const privateMode=new BrowserTimeoutAlerts({...port,read(){throw Error('Blocked storage');},write(){throw Error('Blocked storage');}});
const isolated={...item,id:'private-1'};privateMode.sync([isolated]);privateMode.sync([isolated]);assert.equal(notifications.length,7);privateMode.dispose();assert.equal(notifications[6].closed,true);
const unavailable=new BrowserTimeoutAlerts({...port,show(){throw Error('Unsupported notification constructor');}});assert.doesNotThrow(()=>unavailable.sync([{...item,id:'unsupported'}]));
first.dispose();otherTab.dispose();
let clicked=null,closed=false;const native={onclick:null,onerror:null,close(){closed=true;}};
createTimeoutNotification(item,'new',request=>{clicked=request;},(title,options)=>{assert.equal(title,'Timeout requested: Alpha');assert.equal(options.requireInteraction,true);assert.equal(options.tag,'veto-timeout:report-1');assert.match(options.body,/Alpha vs Beta.*acknowledge/);return native;});
native.onclick();assert.equal(clicked,item);assert.equal(closed,true);
createTimeoutNotification(item,'reminder',()=>{},title=>{assert.equal(title,'Timeout not acknowledged: Alpha');return native;});
createTimeoutNotification(item,'new',()=>{},(title,options)=>{assert.equal(title,'3 timeout requests need attention');assert.match(options.body,/Including Alpha/);return native;},3);
console.log('PASS browser timeout alerts: permission gate, one immediate alert, single two-minute reminder, acknowledgment stops alerts across tabs, resolution closes, no stale reminder replay, coalesced bursts, legacy records, private storage and unsupported browser recovery');
