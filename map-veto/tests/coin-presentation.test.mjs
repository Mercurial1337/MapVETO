import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {freshDatabaseSql} from '../scripts/fresh-database.mjs';
import {coinGif,coinRevealKey,canPlayCoinGif,hideCoinResult} from '../src/lib/veto/coinPresentation.ts';

assert.equal(coinGif('team_a'),'/coin-toss/green-wins.gif');assert.equal(coinGif('team_b'),'/coin-toss/purple-wins.gif');assert.equal(coinGif('system'),null);
const presentation={id:'match',status:'side_selection',coin_toss_winner:'team_a',coin_toss_forced:false,coin_toss_reveal_at:'2099-01-01T00:00:00Z',coin_toss_animation_ms:4000};
assert.ok(coinRevealKey(presentation));for(const patch of [{status:'ready_check'},{status:'in_progress'},{coin_toss_forced:true},{coin_toss_animation_ms:0},{coin_toss_reveal_at:'bad'}])assert.equal(coinRevealKey({...presentation,...patch}),null);
const end=Date.parse(presentation.coin_toss_reveal_at);assert.equal(canPlayCoinGif(presentation.coin_toss_reveal_at,4000,end-5000),true);assert.equal(canPlayCoinGif(presentation.coin_toss_reveal_at,4000,end-3000),false);assert.equal(canPlayCoinGif(presentation.coin_toss_reveal_at,4000,null),false);
const logs=[{id:'ready',action_type:'ready_check'},{id:'coin',action_type:'coin_toss'},{id:'forced',action_type:'admin_action',metadata:{winner:'team_b'}}];assert.deepEqual(hideCoinResult(logs,true).map(l=>l.id),['ready']);assert.equal(hideCoinResult(logs,false),logs);
const db=new PGlite(),rpc=async(name,args)=>(await db.query(`SELECT ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) value`,args)).rows[0].value;
try{
 await db.exec(`CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT NULL::uuid'; CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS 'SELECT current_user::text'; CREATE SCHEMA cron; CREATE FUNCTION cron.schedule(text,text,text) RETURNS bigint LANGUAGE sql AS 'SELECT 1::bigint'; CREATE SCHEMA extensions; CREATE PUBLICATION supabase_realtime;`);
 await db.exec(freshDatabaseSql().replace(/CREATE EXTENSION[^;]+;/g,'').replaceAll('uuid_generate_v4()','gen_random_uuid()'));
 const game=randomUUID(),template=randomUUID();await db.query("INSERT INTO games(id,name,slug) VALUES($1,'Coin QA','coin-qa')",[game]);await db.query("INSERT INTO veto_templates(id,game_id,name,format,sequence) VALUES($1,$2,'Coin QA','bo3',$3)",[template,game,JSON.stringify({steps:[{action:'ban',actor:'team_a',step:1}]})]);
 async function toss({seeded=false,automatic=true,noShow=false}={}){
  const id=randomUUID();await db.query("INSERT INTO matches(id,veto_template_id,team_a_name,team_b_name,format,status,auto_coin_toss,coin_toss_forced,coin_toss_winner,veto_no_show_teams) VALUES($1,$2,'Green QA','Purple QA','bo3','ready_check',$3,$4,$5,$6)",[id,template,automatic,seeded,seeded?'team_a':null,noShow?['team_b']:[]]);
  const links=Object.fromEntries((await db.query('SELECT link_type,token FROM match_links WHERE match_id=$1',[id])).rows.map(l=>[l.link_type,l.token]));
  // No-show fixtures bypass readiness enforcement for this presentation-only check.
  if(noShow){await db.query('UPDATE match_state SET team_a_ready=true,team_b_ready=true WHERE match_id=$1',[id]);await db.query("UPDATE matches SET status='side_selection',coin_toss_winner='team_a' WHERE id=$1",[id]);}
  else {await rpc('veto_ready',[id,links.team_a]);await rpc('veto_ready',[id,links.team_b]);}
  return {id,links,...(await db.query('SELECT * FROM matches WHERE id=$1',[id])).rows[0]};
 }
 const disabled=await toss();assert.equal(disabled.coin_toss_reveal_at,null);assert.equal(disabled.coin_toss_animation_ms,0);
 await db.query('UPDATE coin_toss_presentation_settings SET duration_ms=4000');
 for(const winner of ['team_a','team_b']){
  const f=await toss({automatic:false});await rpc('veto_coin',[f.id,f.links.admin,winner]);
  const m=(await db.query('SELECT * FROM matches WHERE id=$1',[f.id])).rows[0],s=(await db.query('SELECT * FROM match_state WHERE match_id=$1',[f.id])).rows[0];assert.equal(m.coin_toss_winner,winner);assert.equal(m.coin_toss_animation_ms,4000);assert.equal(s.turn_started_at.toISOString(),m.coin_toss_reveal_at.toISOString());
  const left=(await db.query('SELECT extract(epoch FROM ($1::timestamptz-clock_timestamp())) seconds',[m.coin_toss_reveal_at])).rows[0].seconds;assert.ok(Number(left)>4 && Number(left)<=6);
  await assert.rejects(()=>rpc('veto_position',[f.id,f.links[winner],true]),/reveal is still/);
  await assert.rejects(()=>rpc('veto_position',[f.id,null,true,true,s.turn_started_at]),/reveal is still/);
  await db.query("UPDATE matches SET coin_toss_reveal_at=now()-interval '1 second' WHERE id=$1",[f.id]);await db.query('UPDATE match_state SET turn_started_at=now() WHERE match_id=$1',[f.id]);
  await rpc('veto_position',[f.id,f.links[winner],true]);assert.equal((await db.query('SELECT status FROM matches WHERE id=$1',[f.id])).rows[0].status,'in_progress');
 }
 const automatic=await toss();assert.ok(automatic.coin_toss_reveal_at);await rpc('veto_admin',[automatic.id,automatic.links.admin,'reset',null,null,'QA reset',null]);const reset=(await db.query('SELECT * FROM matches WHERE id=$1',[automatic.id])).rows[0];assert.equal(reset.coin_toss_reveal_at,null);assert.equal(reset.coin_toss_animation_ms,0);
 for(const options of [{seeded:true},{noShow:true}])assert.equal((await toss(options)).coin_toss_reveal_at,null);
 for(const role of ['anon','authenticated'])assert.equal((await db.query("SELECT has_table_privilege($1,'coin_toss_presentation_settings','UPDATE') allowed",[role])).rows[0].allowed,false);
 console.log('PASS coin presentation: backend winner/colour mapping, disabled until media, automatic/manual toss, shared reveal/60-second clock, premature choice denied, seeded/no-show bypass, reset cleanup, hidden logs, late-load fallback and private settings');
}finally{await db.close();}
