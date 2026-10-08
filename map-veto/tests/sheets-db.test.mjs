import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createClient} from '@supabase/supabase-js';
process.loadEnvFile('.env.local');
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY),qa=JSON.parse(readFileSync('.qa-sheet-session.json','utf8')),event=randomUUID();
const row=(id,format='bo3',status='ready')=>({source_id:id,round:'QA',team_a:'QA Alpha '+id,team_b:status==='waiting'?'Winner from #1':'QA Beta '+id,format,row:2,status,issue:''});
async function apply(rows,choices=null,tab=1){return db.rpc('sheet_apply_day',{p_event:event,p_user:qa.owner.id,p_spreadsheet:qa.sheet,p_tab:tab,p_title:'QA',p_rows:rows,p_choices:choices});}
const choices=rows=>rows.map(r=>({source_id:r.source_id,selection:r.source_id==='BO1'?'B':r.source_id==='BO5'?'A':'C'}));
try{
 assert.ifError((await db.from('events').insert({id:event,name:'Codex Sheets QA atomic '+event,created_by:qa.owner.id})).error);
 assert.ifError((await db.from('event_sheet_connections').insert({event_id:event,spreadsheet_id:qa.sheet,connected_by:qa.owner.id})).error);
 let rows=[row('BO1','bo1'),row('BO3'),row('BO5','bo5'),row('WAIT','bo3','waiting'),row('EXCLUDED')];
 const selected=choices(rows.slice(0,4));const race=await Promise.all([apply(rows,selected),apply(rows,selected)]);for(const r of race)assert.ifError(r.error);assert.equal(race.reduce((s,r)=>s+r.data.created,0),3);
 let {data:matches}=await db.from('matches').select('id,format,coin_toss_winner,coin_toss_forced,auto_coin_toss').eq('event_id',event);assert.equal(matches.length,3);assert.equal(matches.find(m=>m.format==='bo1').coin_toss_winner,'team_b');assert.equal(matches.find(m=>m.format==='bo5').coin_toss_winner,'team_a');assert.equal(matches.find(m=>m.format==='bo3').auto_coin_toss,true);
 rows[3]={...rows[3],team_b:'QA Resolved Winner',status:'ready'};const resolved=await apply(rows);assert.ifError(resolved.error);assert.equal(resolved.data.created,1);assert.equal((await apply(rows)).data.created,0);
 rows[0]={...rows[0],row:20,round:'Moved'};assert.equal((await apply(rows)).data.created,0);
 rows[1]={...rows[1],team_b:'QA Changed Opponent'};const conflict=await apply(rows);assert.ifError(conflict.error);assert.equal(conflict.data.conflicts,1);assert.equal((await db.from('matches').select('id').eq('event_id',event)).data.length,4);
 const deleted=matches.find(m=>m.format==='bo1').id;assert.ifError((await db.from('matches').delete().eq('id',deleted)).error);assert.equal((await apply(rows)).data.created,0);const history=(await db.from('sheet_match_sources').select('*').eq('event_id',event)).data;assert.equal(history.find(s=>s.source_id==='BO1').status,'deleted');assert.equal(history.find(s=>s.source_id==='EXCLUDED').approved,false);
 const wrongDay=await apply([rows[2]],choices([rows[2]]),2);assert.ok(wrongDay.error);
 const bad=row('BAD','bo7');const rollback=await apply([row('ROLLBACK'),bad],choices([row('ROLLBACK'),bad]));assert.ok(rollback.error);assert.equal((await db.from('sheet_match_sources').select('id').eq('event_id',event).eq('source_id','ROLLBACK')).data.length,0);
 // A manual match is linked explicitly rather than duplicated.
 const manualRow=row('MANUAL'),manualId=randomUUID(),template=(await db.from('veto_templates').select('id').eq('format','bo3').eq('is_default',true).single()).data;
 assert.ifError((await db.from('matches').insert({id:manualId,event_id:event,created_by:qa.owner.id,veto_template_id:template.id,format:'bo3',team_a_name:manualRow.team_a,team_b_name:manualRow.team_b,status:'ready_check'})).error);
 const blocked=await apply([...rows,manualRow],choices([manualRow]));assert.ifError(blocked.error);assert.equal(blocked.data.created,0);const source=(await db.from('sheet_match_sources').select('id,status').eq('event_id',event).eq('source_id','MANUAL').single()).data;assert.equal(source.status,'conflict');assert.ifError((await db.rpc('sheet_link_existing',{p_event:event,p_user:qa.owner.id,p_source:source.id,p_match:manualId})).error);
 assert.equal((await apply([...rows,manualRow])).data.created,0);
 await db.from('event_sheet_connections').update({active_tabs:[]}).eq('event_id',event);const stopped=await apply([row('STOPPED')]);assert.equal(stopped.data.created,0);
 console.log('PASS Sheets database: BO1/BO3/BO5, A/B/C, concurrent creation, late opponent resolution, excluded IDs stay excluded, moved rows, conflicts preserve vetoes, deletion tombstones, cross-day duplicates, transaction rollback, manual match linking and stopped-sync race guard');
}finally{await db.from('matches').delete().eq('event_id',event);await db.from('events').delete().eq('id',event).like('name','Codex Sheets QA atomic%');}
