import pg from 'pg';import {readFileSync} from 'node:fs';import {randomUUID} from 'node:crypto';import assert from 'node:assert/strict';
process.loadEnvFile('.env.local');const db=new pg.Client({connectionString:process.env.SUPABASE_DB_URL,ssl:{rejectUnauthorized:true,ca:readFileSync('scripts/supabase-ca.crt','utf8')}});const id=randomUUID();
await db.connect();
try {
 const template=(await db.query("SELECT id FROM veto_templates WHERE format='bo3' AND is_default LIMIT 1")).rows[0].id;
 await db.query("INSERT INTO matches(id,veto_template_id,team_a_name,team_b_name,format,status,coin_toss_winner,coin_toss_forced) VALUES($1,$2,'Codex background QA Alpha','Codex background QA Beta','bo3','side_selection','team_a',true)",[id,template]);
 await db.query("UPDATE match_state SET automation_enabled=true,team_a_ready=true,team_b_ready=true,turn_started_at=now()-interval '61 seconds' WHERE match_id=$1",[id]);
 let advanced=false;
 for(let i=0;i<10;i++) {await new Promise(resolve=>setTimeout(resolve,1500));if((await db.query('SELECT status FROM matches WHERE id=$1',[id])).rows[0].status==='in_progress'){advanced=true;break;}}
 assert.ok(advanced,'Scheduled worker did not advance the disconnected QA match');
 const log=(await db.query("SELECT metadata FROM match_logs WHERE match_id=$1 AND action_type='position_choice'",[id])).rows[0];assert.equal(log.metadata.timeout,true);
 const job=(await db.query("SELECT schedule,active FROM cron.job WHERE jobname='map-veto-timeouts'")).rows[0];assert.equal(job.active,true);assert.equal(job.schedule,'1 second');
 console.log('PASS actual Supabase cron: disconnected match advances, timeout log written, 1-second job active');
}finally{await db.query('DELETE FROM matches WHERE id=$1',[id]);await db.end();}
