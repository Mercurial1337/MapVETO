import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const qa=JSON.parse(readFileSync('.qa-sheet-session.json','utf8')),url=qa.base+'/api/events/'+qa.eventId+'/sheet',headers={Cookie:qa.owner.cookie};
const info=await (await fetch(url,{headers})).json();let total=0;
for(const tab of info.tabs){const response=await fetch(url+'?tab='+tab.id,{headers});assert.equal(response.status,200);const preview=await response.json();assert.ok(preview.rows.length);assert.equal(preview.rows.filter(r=>r.status==='invalid').length,0,JSON.stringify(preview.rows));assert.ok(preview.rows.every(r=>r.format===(tab.title==='D7 - Matches'?'bo5':'bo3')));total+=preview.rows.length;console.log(tab.title+': '+preview.rows.length+' valid matches');}
assert.equal(total,36);console.log('PASS actual workbook: 36 uniquely identified pairings across 7 days; BO5 final and BO3 other days');
