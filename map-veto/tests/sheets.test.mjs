import assert from 'node:assert/strict';
import {parseDay,csvValues,spreadsheetId,visibleRow} from '../src/lib/sheets/parse.ts';
import {scopeDayPreview} from '../src/lib/sheets/preview.ts';
const rows=[['Round','Status','Names','MapVETO Match ID','Format'],['R1','','Fnatic','D1-M01','BO1'],['','','LOUD','',''],['R2','','Winner from #1','D1-M02','BO3'],['','','Sentinels','',''],['GF','','G2','D1-M03','BO5'],['','','Liquid','','']];
let parsed=parseDay(rows);assert.deepEqual(parsed.map(r=>[r.source_id,r.format,r.status]),[['D1-M01','bo1','ready'],['D1-M02','bo3','waiting'],['D1-M03','bo5','ready']]);assert.equal(parsed[1].round,'R2');
const moved=[rows[0],...rows.slice(5),...rows.slice(1,5)];assert.equal(parseDay(moved)[0].source_id,'D1-M03');
const duplicate=structuredClone(rows);duplicate[3][3]='D1-M01';assert.equal(parseDay(duplicate)[0].status,'invalid');assert.equal(parseDay(duplicate)[1].status,'invalid');
const missing=structuredClone(rows);missing[1][3]='';missing[5][4]='BO7';assert.equal(parseDay(missing)[0].status,'invalid');assert.equal(parseDay(missing)[2].status,'invalid');
const final=structuredClone(rows);final[3][2]='Fnatic';assert.equal(parseDay(final)[1].status,'ready');final[1][1]='Ended';assert.equal(parseDay(final)[0].status,'skipped');final[5][2]='#REF!';assert.equal(parseDay(final)[2].status,'waiting');
const shifted=rows.map(row=>['',...row]);assert.equal(parseDay(shifted)[0].team_a,'Fnatic');
const blank=structuredClone(rows);blank[1][2]='';blank[2][2]='';assert.equal(parseDay(blank)[0].source_id,'D1-M01');assert.equal(parseDay(blank)[0].status,'waiting');blank[2][2]='Fnatic';assert.equal(parseDay(blank)[0].status,'waiting');
assert.deepEqual(csvValues('Names,ID\r\n"Team, A",one\r\n"a""b",two'),[['Names','ID'],['Team, A','one'],['a"b','two']]);
assert.throws(()=>spreadsheetId('https://evil.example/anything'));assert.equal(spreadsheetId('https://docs.google.com/spreadsheets/d/12345678901234567890/edit'),'12345678901234567890');
assert.throws(()=>parseDay([['Team A','Team B']]));
assert.ok(parseDay(rows).every(r=>r.password===null && r.password_status==='not_used'));
const secured=[['Round','Status','Names','MapVETO Match ID','Format','Password'],['R1','','Fnatic','D1-M01','BO1','0042'],['','','LOUD','','','B0042'],['R1','','G2','D1-M02','BO3','Pa$$ w0rd!é'],['','','Liquid','','','Pa$$ w0rd!é'],['R2','','Winner from #1','D1-M03','BO3',''],['','','Sentinels','','',''],['R2','','NRG','D1-M04','BO3','abcd'],['','','EG','','','ABCD'],['R3','','KRÜ','D1-M05','BO3',' padded '],['','','MIBR','','','valid-b'],['R3','Ended','100T','D1-M06','BO3',''],['','','C9','','',''],['R4','','FUT','D1-M07','BO5',''],['','','BBL','','','second-row']];
let locked=parseDay(secured);
assert.equal(locked[0].password,'0042');assert.equal(locked[0].team_b_password,'B0042');assert.equal(locked[0].password_status,'supplied');assert.equal(locked[0].status,'ready');
assert.equal(locked[1].password,'Pa$$ w0rd!é');assert.equal(locked[1].status,'ready');
assert.equal(locked[2].status,'invalid');assert.equal(locked[2].password_status,'missing');assert.match(locked[2].issue,/password/);
assert.equal(locked[3].status,'ready');assert.equal(locked[3].password,'abcd');assert.equal(locked[3].team_b_password,'ABCD');
assert.equal(locked[4].status,'invalid');assert.equal(locked[4].password_status,'invalid');assert.equal(locked[4].password,null);
assert.equal(locked[5].status,'skipped');assert.equal(locked[5].password_status,'missing');
assert.equal(locked[6].password,null);assert.equal(locked[6].status,'invalid');assert.equal(locked[6].password_status,'missing');
for(const password of ['a','0','ab','abc','é','🔑','a'.repeat(128)]){
 const short=structuredClone(secured);short[1][5]=password;short[2][5]=password;
 const result=parseDay(short)[0];assert.equal(result.password_status,'supplied');assert.equal(result.status,'ready');assert.equal(result.password,password);assert.equal(result.team_b_password,password);
}
for(const password of ['a'.repeat(129),'a\nb']){
 const invalid=structuredClone(secured);invalid[2][5]=password;assert.equal(parseDay(invalid)[0].password_status,'invalid');
}
assert.ok(locked.map(visibleRow).every(r=>!('password' in r) && !('team_b_password' in r) && !JSON.stringify(r).includes('0042') && 'password_status' in r));
assert.equal(parseDay(csvValues('Status,Names,MapVETO Match ID,Format,Password\r\n,A,X1,BO3,0007\r\n,B,,,b007'))[0].password,'0007');
console.log('PASS sheet passwords: 1–128 characters accepted for both teams, leading zeros, case and special characters unchanged, separate team-row values preserved, missing/oversized/control/padded cells blocked, waiting fixtures need passwords, skipped rows unaffected, preview rows omit plaintext');
console.log('PASS sheet parser: two-row layout, BO1/BO3/BO5, shifted headers, round sections, unresolved/formula errors, duplicate IDs, stable IDs after movement and CSV quoting');
const previewSources=[{source_id:'D1-M01',tab_id:1,tab_title:'D1 - Matches',was_created:true,password_update:true},{source_id:'D1-M03',tab_id:2,tab_title:'D2 - Matches',was_created:true}];
const scoped=scopeDayPreview(parsed.map(visibleRow),previewSources,2);
assert.equal(scoped.rows[0].status,'invalid');assert.match(scoped.rows[0].issue,/D1-M01.*D1 - Matches/);
assert.equal(scoped.rows[1].status,'waiting');assert.equal(scoped.rows[2].status,'ready');
assert.deepEqual(scoped.sources,[previewSources[1]]);assert.equal(parsed[0].status,'ready');
console.log('PASS day preview: cross-day IDs show a named conflict, other-day matches are not counted as imported and cannot expose password approval controls, original parsed rows unchanged');
