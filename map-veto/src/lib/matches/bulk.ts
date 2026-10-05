export interface BulkRow {match_number:number;team_a_name:string;team_b_name:string;selection:'A'|'B'|'C';}
export const BULK_HEADER='Match Number, Team A, Team B, Higher Seed (A/B) or Coin Flip (C)';
export const BULK_MAX_ROWS=500;
export const BULK_MAX_BYTES=1024*1024;
export class BulkFileError extends Error {}

export function parseBulkFile(input:string):BulkRow[] {
 const text=input.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');
 if(new TextEncoder().encode(text).length>BULK_MAX_BYTES) throw new BulkFileError('The file must be at most 1 MB.');
 const records:{cells:string[];line:number}[]=[];
 let cells:string[]=[],cell='',line=1,startLine=1,quoted=false,closed=false;
 function endCell(){cells.push(cell.trim());cell='';closed=false;}
 function endRow(){endCell();if(cells.some(value=>value!=='')) records.push({cells,line:startLine});cells=[];startLine=line+1;}
 for(let i=0;i<text.length;i++) {
  const char=text[i];
  if(quoted) {
   if(char==='"') {if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}
   else {cell+=char;if(char==='\n')line++;}
  } else if(char===',') endCell();
  else if(char==='\n') {endRow();line++;}
  else if(char==='"') {if(cell.trim() || closed)throw new BulkFileError(`Line ${line}: unexpected quote.`);cell='';quoted=true;}
  else {if(closed && char.trim())throw new BulkFileError(`Line ${line}: unexpected text after a quoted field.`);if(!closed)cell+=char;}
 }
 if(quoted)throw new BulkFileError(`Line ${startLine}: unclosed quoted field.`);
 endRow();
 if(records[0]?.cells[0].toLowerCase()==='match number') {
  const header=records.shift()!;
  if(header.cells.length!==4 || header.cells[1].toLowerCase()!=='team a' || header.cells[2].toLowerCase()!=='team b' || !/^higher seed(?: \(a\/b\) or coin flip \(c\))?$/i.test(header.cells[3])) throw new BulkFileError('Use the provided four-column header.');
 }
 if(!records.length)throw new BulkFileError('The file has no matches.');
 if(records.length>BULK_MAX_ROWS)throw new BulkFileError(`Import at most ${BULK_MAX_ROWS} matches per file.`);
 const numbers=new Set<number>();
 return records.map(({cells,line})=>{
  if(cells.length!==4)throw new BulkFileError(`Line ${line}: expected four columns.`);
  const [number,a,b,mode]=cells,match_number=Number(number),selection=mode.toUpperCase();
  if(!/^\d+$/.test(number) || !Number.isSafeInteger(match_number) || match_number<1 || match_number>2147483647)throw new BulkFileError(`Line ${line}: match number must be a positive whole number.`);
  if(numbers.has(match_number))throw new BulkFileError(`Line ${line}: duplicate match number ${match_number}.`);
  numbers.add(match_number);
  if(!a || !b || a.length>100 || b.length>100 || /[\u0000-\u001f]/.test(a+b))throw new BulkFileError(`Line ${line}: each team name must contain 1–100 characters without control characters.`);
  if(a.toLowerCase()===b.toLowerCase())throw new BulkFileError(`Line ${line}: the teams must be different.`);
  if(selection!=='A' && selection!=='B' && selection!=='C')throw new BulkFileError(`Line ${line}: use A, B or C for higher seed / coin flip.`);
  return {match_number,team_a_name:a,team_b_name:b,selection};
 });
}
