import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
process.loadEnvFile('.env.local');
// Live vetoes are private until complete. Requires the app at TEST_APP_URL (default http://127.0.0.1:3001) and migration 040.
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY),anon=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const base=process.env.TEST_APP_URL || 'http://127.0.0.1:3001',id=randomUUID();
const {data:template}=await db.from('veto_templates').select('id').eq('format','bo3').eq('is_default',true).single();
const get=async path=>{const response=await fetch(base+path);return {status:response.status,data:await response.json()};};
async function anonymousView() {
 const [match,state,logs]=await Promise.all([anon.from('matches').select('id').eq('id',id),anon.from('match_state').select('match_id').eq('match_id',id),anon.from('match_logs').select('id').eq('match_id',id)]);
 return [match.data?.length || 0,state.data?.length || 0,logs.data?.length || 0];
}
try {
 assert.ifError((await db.from('matches').insert({id,veto_template_id:template.id,team_a_name:'Codex Privacy Alpha',team_b_name:'Codex Privacy Beta',format:'bo3',status:'ready_check'})).error);
 const {data:links}=await db.from('match_links').select('link_type,token').eq('match_id',id);const team=links.find(l=>l.link_type==='team_a').token;
 assert.equal((await fetch(base+'/api/veto/ready',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({match_id:id,token:team})})).status,200);
 for(const status of ['ready_check','in_progress']) {
  if(status!=='ready_check')assert.ifError((await db.from('matches').update({status}).eq('id',id)).error);
  assert.deepEqual(await anonymousView(),[0,0,0],status);
  assert.equal((await get(`/api/matches/${id}/public`)).status,404);assert.equal((await get(`/api/matches/${id}`)).status,404);
  for(const query of ['',`?status=${status}`])assert.ok(!(await get('/api/matches/public'+query)).data.matches.some(m=>m.id===id));
  const page=await (await fetch(`${base}/public/log/${id}`)).text();assert.ok(!page.includes('Codex Privacy Alpha'));
 }
 assert.ifError((await db.from('matches').update({status:'completed',completed_at:new Date().toISOString()}).eq('id',id)).error);
 const [matches,states,logs]=await anonymousView();assert.equal(matches,1);assert.equal(states,1);assert.ok(logs>=1);
 assert.equal((await get(`/api/matches/${id}/public`)).status,200);assert.equal((await get(`/api/matches/${id}`)).data.match.id,id);
 assert.ok((await get('/api/matches/public?status=completed&limit=100')).data.matches.some(m=>m.id===id));
 console.log('PASS match privacy: before completion anonymous table reads, public endpoints, match API, listings and public log reveal nothing; after completion all are public');
}finally{await db.from('matches').delete().eq('id',id);}
