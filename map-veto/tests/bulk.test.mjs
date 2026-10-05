import assert from 'node:assert/strict';
import {parseBulkFile,BULK_HEADER} from '../src/lib/matches/bulk.ts';
const input=`${BULK_HEADER}\n1, Fnatic, Sentinels, A\n2, Paper Rex, LOUD, B\n3, G2, Liquid, C\n`;
const rows=parseBulkFile(input);
assert.deepEqual(rows.map(row=>row.selection),['A','B','C']);assert.equal(rows[1].team_a_name,'Paper Rex');
assert.deepEqual(parseBulkFile('\uFEFF'+input.replaceAll('\n','\r\n')),rows);
assert.equal(parseBulkFile('1,"Team, One","Team ""Two""",c')[0].team_b_name,'Team "Two"');
assert.equal(parseBulkFile('\n1, A, B, C\n\n')[0].selection,'C');
for(const [file,message] of [
 ['',/no matches/],[BULK_HEADER,/no matches/],['1,A,B,C\n1,C,D,A',/duplicate/],['1.2,A,B,C',/whole number/],
 ['0,A,B,C',/whole number/],['2147483648,A,B,C',/whole number/],['1,A,A,A',/different/],['1,,B,C',/team name/],
 ['1,A,B,X',/A, B or C/],['1,A,B',/four columns/],['1,"A,B,C',/unclosed/],['1,"A"bad,B,C',/unexpected/],
 ['1,A,B,C,extra',/four columns/],['Match Number, Wrong, Team B, Higher Seed\n1,A,B,C',/header/],
 ['1,"Line\nBreak",B,C',/control characters/],['x'.repeat(1024*1024+1),/1 MB/],
 [Array.from({length:501},(_,i)=>`${i+1}, A, B, C`).join('\n'),/500/],
])assert.throws(()=>parseBulkFile(file),message);
console.log('PASS bulk parser: supplied format, TXT/CSV, BOM/CRLF, quoting, row errors, duplicate numbers, invalid seed, empty and oversized files');
