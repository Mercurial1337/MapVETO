import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {createServerClient} from '@supabase/ssr';
import sharp from 'sharp';
process.loadEnvFile('.env.local');
const base=process.env.TEST_APP_URL||'http://127.0.0.1:3333';
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
assert.ok(process.env.NEXT_PUBLIC_SUPABASE_URL.includes('rmertbxmgsnxkqvdhbii'),'Run this fixture against VG Veto using --env-file=.env.vgveto.local');
const sheet='1tifK0_pUo4iLxJ1cGVECxONf5B-fw0_u4iI8G1gh8NA';
let userId,eventId;
try{
 const email=`logos-${randomUUID()}@example.invalid`,password=randomUUID()+'aA!';
 const account=await db.auth.admin.createUser({email,password,email_confirm:true});assert.ifError(account.error);userId=account.data.user.id;
 const jar=new Map(),auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:items=>items.forEach(({name,value})=>jar.set(name,value))}});
 assert.ifError((await auth.auth.signInWithPassword({email,password})).error);
 const cookie=[...jar].map(([name,value])=>`${name}=${value}`).join('; ');
 async function request(path,body){const response=await fetch(base+path,{method:body?'POST':'GET',headers:{cookie,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});const data=await response.json();assert.ok(response.ok,data.error||`HTTP ${response.status}`);return data;}
 const event=await request('/api/events',{name:'Codex sheet logos HTTP QA '+randomUUID(),google_sheet_id:sheet});eventId=event.event.id;
 const info=await request(`/api/events/${eventId}/sheet`),tab=info.tabs.find(t=>t.title==='D2 - Matches');assert.ok(tab);
 const endpoint=`/api/events/${eventId}/sheet`,preview=await request(endpoint+'?tab='+tab.id);
 const row=preview.rows.find(r=>r.source_id==='D2-M02');assert.ok(row);assert.equal(row.status,'ready');assert.equal(row.team_a,'Baz esports');assert.equal(row.team_b,'Team Project');
 const confirmed=await request(endpoint,{operation:'confirm',tab:tab.id,hash:preview.hash,choices:[{source_id:'D2-M02',selection:'C',scheduled_at:null}]});assert.equal(confirmed.created,1);
 const found=await db.from('matches').select('id,team_a_name,team_b_name,team_a_logo,team_b_logo').eq('event_id',eventId).single();assert.ifError(found.error);let match=found.data;
 for(let i=0;i<35 && (!match.team_a_logo || !match.team_b_logo);i++){
  await new Promise(resolve=>setTimeout(resolve,1000));const result=await db.from('matches').select('id,team_a_logo,team_b_logo').eq('id',match.id).single();assert.ifError(result.error);match={...match,...result.data};
 }
 assert.ok(match.team_a_logo,'Baz esports logo attached after response');assert.ok(match.team_b_logo,'Team Project logo attached after response');assert.notEqual(match.team_a_logo,match.team_b_logo);
 const sizes=[];
 for(const url of [match.team_a_logo,match.team_b_logo]){assert.match(url,/\/storage\/v1\/object\/public\/event-assets\/sheet-team-logos\/[a-f0-9]{64}\.webp$/);const response=await fetch(url);assert.equal(response.status,200);const bytes=Buffer.from(await response.arrayBuffer()),meta=await sharp(bytes).metadata();assert.equal(meta.format,'webp');assert.ok(meta.width<=128 && meta.height<=128);sizes.push(bytes.length);}
 const source=await db.from('sheet_match_sources').select('id,logos_checked_at,logos_retry_after').eq('event_id',eventId).eq('source_id','D2-M02').single();assert.ifError(source.error);assert.ok(source.data.logos_checked_at);assert.equal(source.data.logos_retry_after,null);
 const claim=await db.rpc('sheet_claim_logos',{p_event:eventId,p_spreadsheet:sheet,p_tab:tab.id});assert.ifError(claim.error);assert.deepEqual(claim.data,[],'completed logo jobs do not download/export again');
 const roster=await db.from('event_teams').select('name,logo_url').eq('event_id',eventId);assert.ifError(roster.error);assert.equal(roster.data.find(t=>t.name==='Baz esports').logo_url,match.team_a_logo);assert.equal(roster.data.find(t=>t.name==='Team Project').logo_url,match.team_b_logo);
 await request(endpoint,{operation:'sync'});const again=await db.from('matches').select('id,team_a_logo,team_b_logo').eq('event_id',eventId);assert.ifError(again.error);assert.equal(again.data.length,1);assert.equal(again.data[0].team_a_logo,match.team_a_logo);assert.equal(again.data[0].team_b_logo,match.team_b_logo);
 const publicLinks=await db.from('match_links').select('token').eq('match_id',match.id).eq('link_type','observer').single();assert.ifError(publicLinks.error);
 const session=await fetch(base+'/api/veto/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({match_id:match.id,token:publicLinks.data.token})});assert.equal(session.status,200);const payload=await session.json();assert.equal(payload.match.team_a_logo,match.team_a_logo);assert.equal(payload.match.team_b_logo,match.team_b_logo);
 console.log('PASS real D2-M02: authenticated confirmation creates one protected match, embedded logos attach asynchronously to correct teams and roster, cached public WebP images load, observer session contains logos, repeated sync preserves logos/match and no repeat image job. Image bytes: '+sizes.join(', '));
}finally{
 if(userId){const fixtures=await db.from('events').select('id').eq('created_by',userId).like('name','Codex sheet logos HTTP QA%');assert.ifError(fixtures.error);for(const fixture of fixtures.data){assert.ifError((await db.from('matches').delete().eq('event_id',fixture.id)).error);assert.ifError((await db.from('events').delete().eq('id',fixture.id)).error);}}
 if(userId)assert.ifError((await db.auth.admin.deleteUser(userId)).error);
}
