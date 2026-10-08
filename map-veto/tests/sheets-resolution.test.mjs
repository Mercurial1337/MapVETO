import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createClient} from '@supabase/supabase-js';
process.loadEnvFile('.env.local');
const qa=JSON.parse(readFileSync('.qa-sheet-session.json','utf8')),db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
const settings=(await db.from('sheet_worker_settings').select('secret').eq('id',true).single()).data;
for(let attempt=0;attempt<4;attempt++){
 assert.ifError((await db.from('event_sheet_connections').update({last_sync_at:null,lease_until:null}).eq('event_id',qa.eventId)).error);
 const response=await fetch(qa.base+'/api/sheets/worker',{method:'POST',headers:{Authorization:'Bearer '+settings.secret}});assert.equal(response.status,200);const result=await response.json();assert.ok(!result.results.find(r=>r.eventId===qa.eventId)?.error,JSON.stringify(result));
 const {data:source}=await db.from('sheet_match_sources').select('match_id').eq('event_id',qa.eventId).eq('source_id','D1-M04').single();if(source.match_id)break;
 await new Promise(resolve=>setTimeout(resolve,1500));
}
const {data:source}=await db.from('sheet_match_sources').select('match_id,selection').eq('event_id',qa.eventId).eq('source_id','D1-M04').single();assert.ok(source.match_id,'The actual Google Sheet opponent must be resolved for this test');assert.equal(source.selection,'A');
const {data:match}=await db.from('matches').select('team_b_name,coin_toss_winner,coin_toss_forced').eq('id',source.match_id).single();assert.equal(match.team_b_name,'Codex Sheet QA Winner');assert.equal(match.coin_toss_winner,'team_a');assert.equal(match.coin_toss_forced,true);
assert.equal((await db.from('matches').select('id').eq('event_id',qa.eventId)).data.length,2);
console.log('PASS real sheet opponent resolution: worker created the previously approved D1-M04 once, preserved higher seed A, and left unchecked matches excluded');
