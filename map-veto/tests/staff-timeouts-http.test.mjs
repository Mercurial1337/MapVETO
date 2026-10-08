import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {createClient} from '@supabase/supabase-js';
import {createServerClient} from '@supabase/ssr';
process.loadEnvFile('.env.local');
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY),base=process.env.TEST_APP_URL || 'http://127.0.0.1:3001';
const keep=process.argv.includes('--keep'),userIds=[];let eventId,id,channel;
const anon=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
async function cleanup(qa){assert.ifError((await db.from('matches').delete().eq('id',qa.id).eq('team_a_name','Codex alert QA Alpha')).error);if(qa.eventId)assert.ifError((await db.from('events').delete().eq('id',qa.eventId).like('name','Codex alert QA%')).error);for(const user of qa.userIds)assert.ifError((await db.auth.admin.deleteUser(user)).error);}
if(process.argv.includes('--cleanup')){await cleanup(JSON.parse(readFileSync('.qa-alert-session.json','utf8')));unlinkSync('.qa-alert-session.json');process.exit(0);}
async function account(){const email=`alert-${randomUUID()}@example.invalid`,password=randomUUID()+'aA!';const {data,error}=await db.auth.admin.createUser({email,password,email_confirm:true});assert.ifError(error);userIds.push(data.user.id);const jar=new Map();const client=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:items=>items.forEach(({name,value})=>jar.set(name,value))}});assert.ifError((await client.auth.signInWithPassword({email,password})).error);return {id:data.user.id,cookie:[...jar].map(([name,value])=>`${name}=${value}`).join('; ')};}
async function feed(cookie){const response=await fetch(base+'/api/admin/notifications',{headers:{Cookie:cookie}});assert.equal(response.status,200);return response.json();}
async function post(body){const response=await fetch(base+'/api/veto/timeouts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await response.json();assert.equal(response.status,200,JSON.stringify(data));return data;}
try {
 const owner=await account(),head=await account(),referee=await account(),outsider=await account();eventId=randomUUID();id=randomUUID();
 assert.ifError((await db.from('events').insert({id:eventId,name:'Codex alert QA '+eventId,created_by:owner.id})).error);
 assert.ifError((await db.from('event_admins').insert([{event_id:eventId,user_id:head.id,role:'admin',added_by:owner.id},{event_id:eventId,user_id:referee.id,role:'referee',added_by:owner.id}])).error);
 const {data:template}=await db.from('veto_templates').select('id').eq('format','bo3').eq('is_default',true).single();
 // A Referee who created a match in this event still has only Referee access.
 assert.ifError((await db.from('matches').insert({id,event_id:eventId,created_by:referee.id,veto_template_id:template.id,team_a_name:'Codex alert QA Alpha',team_b_name:'Codex alert QA Beta',format:'bo3',status:'ready_check'})).error);
 const {data:links}=await db.from('match_links').select('link_type,token').eq('match_id',id);const tokens=Object.fromEntries(links.map(link=>[link.link_type,link.token]));
 assert.equal((await fetch(base+'/api/admin/notifications')).status,401);
 let wakeups=0;const messages=[];
 await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Staff subscription failed')),10000);channel=anon.channel('staff-timeouts:'+head.id).on('broadcast',{event:'timeouts_changed'},message=>{messages.push(message.payload);wakeups++;}).subscribe(status=>{if(status==='SUBSCRIBED'){clearTimeout(timeout);resolve();}});});
 const request=randomUUID();await post({operation:'request',match_id:id,token:tokens.team_a,request_id:request,reason:'Game disconnected — needs referee attention'});
 const [owned,admin,ref,out]=await Promise.all([owner,head,referee,outsider].map(user=>feed(user.cookie)));
 for(const data of [owned,admin]){const alert=data.timeouts.find(item=>item.id===request);assert.ok(alert);assert.equal(alert.requestedBy,'Codex alert QA Alpha');assert.equal(alert.reason,'Game disconnected — needs referee attention');assert.equal(alert.matchId,id);assert.ok(!JSON.stringify(alert).includes(tokens.admin));}
 assert.equal(ref.timeouts.some(item=>item.id===request),false);assert.equal(out.timeouts.some(item=>item.id===request),false);
 for(let i=0;i<20 && !wakeups;i++)await new Promise(resolve=>setTimeout(resolve,100));assert.ok(wakeups>0);
 assert.ok(messages.every(payload=>Object.keys(payload).every(key=>key==='id')));
 const before=wakeups;await post({operation:'resolve',match_id:id,token:tokens.admin,request_id:request,resolution:'Connection restored'});
 assert.equal((await feed(head.cookie)).timeouts.some(item=>item.id===request),false);
 for(let i=0;i<20 && wakeups===before;i++)await new Promise(resolve=>setTimeout(resolve,100));assert.ok(wakeups>before);
 console.log('PASS staff timeout feed: owner/Head Admin access, Referee creator and outsider denied, cookie authentication, no link tokens, realtime open/resolve wakeups and resolved requests removed');
 if(keep){await post({operation:'request',match_id:id,token:tokens.team_b,request_id:randomUUID(),reason:'Browser alert QA: client crashed'});writeFileSync('.qa-alert-session.json',JSON.stringify({id,eventId,userIds,tokens,base}));}
}finally{if(channel)await anon.removeChannel(channel);if(!keep)await cleanup({id,eventId,userIds});}
