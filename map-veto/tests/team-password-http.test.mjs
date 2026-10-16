import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {hashPassword} from '../src/lib/auth/teamPassword.ts';
process.loadEnvFile('.env.local');
// Requires the app at TEST_APP_URL (default http://127.0.0.1:3001) and migration 038.
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY),base=process.env.TEST_APP_URL || 'http://127.0.0.1:3001',ids=[];
async function post(path,body,expected,cookie='') {
 const response=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(body)});
 const data=await response.json();assert.equal(response.status,expected,`${path}: ${JSON.stringify(data)}`);
 return {data,cookie:(response.headers.getSetCookie?.()||[]).map(value=>value.split(';')[0]).join('; ')};
}
const {data:template}=await db.from('veto_templates').select('*').eq('format','bo3').eq('is_default',true).single();
const {data:maps}=await db.from('maps').select('id').eq('game_id',template.game_id).eq('is_active',true).limit(7);
async function fixture(password) {
 const id=randomUUID();ids.push(id);
 assert.ifError((await db.from('matches').insert({id,veto_template_id:template.id,team_a_name:'Codex Password Alpha',team_b_name:'Codex Password Beta',format:'bo3',status:'ready_check'})).error);
 await db.from('match_state').update({available_maps:maps.map(m=>m.id)}).eq('match_id',id);
 if(password)assert.ifError((await db.from('match_team_passwords').insert({match_id:id,password_hash:await hashPassword(password)})).error);
 const {data:links}=await db.from('match_links').select('link_type,token').eq('match_id',id);
 return {id,tokens:Object.fromEntries(links.map(l=>[l.link_type,l.token]))};
}
try {
 const locked=await fixture('0042'),other=await fixture('0042'),open=await fixture(null);
 const team=role=>({match_id:locked.id,token:locked.tokens[role]});
 // Without a session nothing about the match is returned and no team action runs.
 for(const role of ['team_a','team_b'])assert.equal((await post('/api/veto/session',team(role),401)).data.password_required,true);
 const deniedCatalog=(await post('/api/veto/session',{...team('team_a'),include_maps:true},401)).data;
 assert.equal(deniedCatalog.password_required,true);assert.equal(deniedCatalog.maps,undefined);
 for(const [path,extra] of [['ready',{}],['position-choice',{pick_first:true}],['action',{action:'ban',map_id:maps[0].id}],['auto-action',{turn_started_at:new Date().toISOString()}],['reset-requests',{operation:'answer',request_id:randomUUID(),approve:true}]])
  assert.equal((await post('/api/veto/'+path,{...team('team_a'),...extra},401)).data.password_required,true,path);
 const page=await (await fetch(`${base}/match/${locked.id}?token=${locked.tokens.team_a}`)).text();assert.ok(!page.includes('Codex Password Alpha'));assert.ok(page.includes('Match password'));
 assert.equal((await post('/api/veto/session',{match_id:locked.id,token:locked.tokens.observer},200)).data.match.team_a_name,'Codex Password Alpha');
 assert.equal((await post('/api/veto/session',{match_id:open.id,token:open.tokens.team_a},200)).data.userRole,'team_a');
 // Exact password, leading zeros kept; the session is scoped to one team link of one match.
 await post('/api/veto/access',{...team('team_a'),password:'42'},401);await post('/api/veto/access',{...team('team_a'),password:'0042 '},401);
 const {cookie}=await post('/api/veto/access',{...team('team_a'),password:'0042'},200);assert.match(cookie,/^mv_team_/);
 assert.equal((await post('/api/veto/session',team('team_a'),200,cookie)).data.userRole,'team_a');
 // Unlocking does not reload the page: hydrate the initially empty map catalog
 // through the session endpoint, then omit it from routine realtime snapshots.
 const hydrated=(await post('/api/veto/session',{...team('team_a'),include_maps:true},200,cookie)).data;
 for(const map of maps)assert.ok(hydrated.maps.some(item=>item.id===map.id && item.name && item.image_url),`Missing map ${map.id}`);
 assert.ok(hydrated.maps.every(item=>item.game_id===template.game_id && item.is_active));
 assert.equal((await post('/api/veto/session',team('team_a'),200,cookie)).data.maps,undefined);
 await post('/api/veto/session',team('team_b'),401,cookie);
 await post('/api/veto/session',{match_id:other.id,token:other.tokens.team_a},401,cookie);
 await post('/api/veto/ready',team('team_a'),200,cookie);
 await post('/api/veto/access',{match_id:locked.id,token:locked.tokens.observer,password:'0042'},401);
 await post('/api/veto/access',{match_id:locked.id,token:randomUUID(),password:'0042'},401);
 // Attempts are limited per team link, including concurrent guesses.
 const guesses=await Promise.all(Array.from({length:7},()=>fetch(base+'/api/veto/access',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...team('team_b'),password:'wrong'})})));
 assert.equal(guesses.filter(r=>r.status===401).length,5);assert.equal(guesses.filter(r=>r.status===429).length,2);
 await post('/api/veto/access',{...team('team_b'),password:'0042'},429);
 // Replacing the password (version bump) revokes the issued session.
 const {data:lock}=await db.from('match_team_passwords').select('version').eq('match_id',locked.id).single();
 assert.ifError((await db.from('match_team_passwords').update({password_hash:await hashPassword('Next!0042'),version:lock.version+1}).eq('match_id',locked.id)).error);
 assert.equal((await post('/api/veto/session',team('team_a'),401,cookie)).data.password_required,true);
 const renewed=await post('/api/veto/access',{...team('team_a'),password:'Next!0042'},200);await post('/api/veto/session',team('team_a'),200,renewed.cookie);
 // Protected match progression: each team keeps the catalog obtained at unlock
 // while readiness, automatic toss, position choice and bans update independently.
 const flow=await fixture('Maps!0042'),clients={};
 assert.ifError((await db.from('matches').update({auto_coin_toss:true}).eq('id',flow.id)).error);
 for(const role of ['team_a','team_b']) {
  const credentials={match_id:flow.id,token:flow.tokens[role]};
  const access=await post('/api/veto/access',{...credentials,password:'Maps!0042'},200);
  const session=await post('/api/veto/session',{...credentials,include_maps:true},200,access.cookie);
  clients[role]={credentials,cookie:access.cookie,maps:session.data.maps};
  assert.ok(maps.every(map=>clients[role].maps.some(item=>item.id===map.id)));
  await post('/api/veto/ready',credentials,200,access.cookie);
 }
 let progress=(await post('/api/veto/session',clients.team_a.credentials,200,clients.team_a.cookie)).data;
 assert.equal(progress.match.status,'side_selection');
 const chooser=clients[progress.match.coin_toss_winner];
 await post('/api/veto/position-choice',{...chooser.credentials,pick_first:true},200,chooser.cookie);
 progress=(await post('/api/veto/session',clients.team_b.credentials,200,clients.team_b.cookie)).data;
 assert.equal(progress.match.status,'in_progress');assert.equal(progress.state.current_step,0);
 for(const client of Object.values(clients))assert.ok(progress.state.available_maps.every(id=>client.maps.some(map=>map.id===id)));
 const actor=clients[progress.state.current_turn];
 const banned=progress.state.available_maps[0];
 await post('/api/veto/action',{...actor.credentials,action:'ban',map_id:banned,turn_started_at:progress.state.turn_started_at},200,actor.cookie);
 for(const client of Object.values(clients)) {
  const updated=(await post('/api/veto/session',client.credentials,200,client.cookie)).data;
  assert.equal(updated.state.current_step,1);assert.ok(updated.state.banned_maps.some(ban=>ban.map_id===banned));
  assert.ok(client.maps.some(map=>map.id===banned));assert.equal(updated.maps,undefined);
 }
 console.log('PASS protected map hydration: maps withheld before unlock, catalog loaded for both teams, check-in/automatic toss/position/ban work with retained catalog, routine snapshots omit maps');
 console.log('PASS password HTTP: team reads/actions/page denied without session, observer and unprotected matches unchanged, exact password, scoped to one team and match, concurrent attempt limit, replacement revokes sessions');
}finally{if(ids.length)await db.from('matches').delete().in('id',ids);}
