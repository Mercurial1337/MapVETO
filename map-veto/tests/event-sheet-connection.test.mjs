import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const db=new PGlite(),owner=randomUUID(),legacy=randomUUID(),connected=randomUUID(),sheet='1tifK0_pUo4iLxJ1cGVECxONf5B-fw0_u4iI8G1gh8NA',other='another_workbook_1234567890';
try {
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE TABLE events(id uuid PRIMARY KEY,google_sheet_id text,created_by uuid); CREATE TABLE event_sheet_connections(event_id uuid PRIMARY KEY REFERENCES events(id),spreadsheet_id text,connected_by uuid,active_tabs jsonb DEFAULT '[]');`);
 await db.query('INSERT INTO events VALUES($1,$2,$3),($4,$5,$3)',[legacy,sheet,owner,connected,other]);
 await db.query('INSERT INTO event_sheet_connections(event_id,spreadsheet_id,connected_by,active_tabs) VALUES($1,$2,$3,$4)',[connected,sheet,owner,JSON.stringify([{id:1,title:'D1 - Matches'}])]);
 await db.exec(readFileSync('supabase/migrations/037_event_sheet_connection.sql','utf8'));
 assert.equal((await db.query('SELECT spreadsheet_id FROM event_sheet_connections WHERE event_id=$1',[legacy])).rows[0].spreadsheet_id,sheet);
 assert.equal((await db.query('SELECT google_sheet_id FROM events WHERE id=$1',[connected])).rows[0].google_sheet_id,sheet);
 assert.deepEqual((await db.query('SELECT active_tabs FROM event_sheet_connections WHERE event_id=$1',[connected])).rows[0].active_tabs,[{id:1,title:'D1 - Matches'}]);
 const fresh=randomUUID();await db.query('INSERT INTO events VALUES($1,$2,$3)',[fresh,sheet,owner]);
 assert.deepEqual((await db.query('SELECT active_tabs FROM event_sheet_connections WHERE event_id=$1',[fresh])).rows[0].active_tabs,[]);
 await assert.rejects(db.query('UPDATE events SET google_sheet_id=$1 WHERE id=$2',[other,connected]),/already has a sheet connected/);
 await assert.rejects(db.query('UPDATE events SET google_sheet_id=NULL WHERE id=$1',[connected]),/already has a sheet connected/);
 const later=randomUUID();await db.query('INSERT INTO events VALUES($1,NULL,$2)',[later,owner]);await db.query('UPDATE events SET google_sheet_id=$1 WHERE id=$2',[sheet,later]);
 assert.equal((await db.query('SELECT spreadsheet_id FROM event_sheet_connections WHERE event_id=$1',[later])).rows[0].spreadsheet_id,sheet);
 console.log('PASS event sheet connection: legacy backfill, existing approvals preserved, atomic creation/editing, workbook replacement/removal rejected');
}finally{await db.close();}
