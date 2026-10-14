export type SheetFormat='bo1'|'bo3'|'bo5';
export type PasswordStatus='not_used'|'supplied'|'missing'|'invalid';
export interface SheetRow {source_id:string;round:string;team_a:string;team_b:string;format:SheetFormat|null;row:number;status:'ready'|'waiting'|'skipped'|'invalid';issue:string;password_status:PasswordStatus;}
// The plaintext password stays on the server; previews and SQL receive SheetRow fields only.
export interface ParsedRow extends SheetRow {password:string|null;}
export const visibleRow=({source_id,round,team_a,team_b,format,row,status,issue,password_status}:ParsedRow):SheetRow=>({source_id,round,team_a,team_b,format,row,status,issue,password_status});
const raw=(value:unknown)=>String(value??''),clean=(value:unknown)=>raw(value).trim();
const header=(value:unknown)=>clean(value).toLowerCase().replace(/[^a-z0-9]/g,'');
export function spreadsheetId(input:string) {
 const value=input.trim(),match=value.match(/^https:\/\/docs\.google\.com\/spreadsheets\/d\/([\w-]+)(?:\/|$)/);
 const id=match?.[1] || value;
 if(!/^[\w-]{20,100}$/.test(id))throw new Error('Paste a Google Sheets URL or valid spreadsheet ID.');
 return id;
}
export function csvValues(text:string):string[][] {
 const rows:string[][]=[];let cells:string[]=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted && text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(c===',' && !quoted){cells.push(cell);cell='';}else if(c==='\n' && !quoted){cells.push(cell.replace(/\r$/,''));rows.push(cells);cells=[];cell='';}else cell+=c;}
 if(quoted)throw new Error('Invalid CSV response from Google Sheets.');
 if(cell || cells.length){cells.push(cell.replace(/\r$/,''));rows.push(cells);}return rows;
}
export function parseDay(values:unknown[][]):ParsedRow[] {
 const first=values.findIndex(row=>row.some(cell=>header(cell)==='names'));
 if(first<0)throw new Error('The day tab must contain a Names header and two rows per match.');
 const headers=values[first].map(header),names=headers.indexOf('names'),id=headers.indexOf('mapvetomatchid'),fmt=headers.indexOf('format'),status=headers.indexOf('status'),pass=headers.indexOf('password');
 const roundColumn=Math.max(0,status-1),rows:ParsedRow[]=[];let round='';
 for(let i=first+1;i<values.length;i++){
  const a=clean(values[i]?.[names]),b=clean(values[i+1]?.[names]);
  if(!a && !b && !clean(values[i]?.[id]))continue;
  round=clean(values[i]?.[roundColumn]) || round;
  const source_id=clean(values[i]?.[id]),rawFormat=clean(values[i]?.[fmt] || values[i+1]?.[fmt]).toLowerCase().replace(/\s/g,'');
  const format:SheetFormat|null=['bo1','bo3','bo5'].includes(rawFormat)?rawFormat as SheetFormat:null;
  // Passwords are case-sensitive and never trimmed; surrounding spaces are reported instead.
  const firstPassword=pass<0?'':raw(values[i]?.[pass]),secondPassword=pass<0?'':raw(values[i+1]?.[pass]),suppliedPassword=firstPassword.trim()?firstPassword:secondPassword;
  let password:string|null=null,password_status:PasswordStatus='not_used';
  if(pass>=0){if(!suppliedPassword.trim())password_status='missing';else if(suppliedPassword!==suppliedPassword.trim() || [...suppliedPassword].length<4 || [...suppliedPassword].length>128 || /[\u0000-\u001f\u007f]/.test(suppliedPassword))password_status='invalid';else{password=suppliedPassword;password_status='supplied';}}
  let state:SheetRow['status']='ready',issue='';
  if(id<0 || !/^[\w.-]{1,100}$/.test(source_id)){state='invalid';issue='Add a permanent MapVETO Match ID on the first team row.';}
  else if(!format){state='invalid';issue='Set Format to BO1, BO3 or BO5.';}
  else if(a.length>100 || b.length>100 || /[\u0000-\u001f]/.test(a+b)){state='invalid';issue='Invalid team name.';}
  else if(/^(ended|started|forfeit|cancelled|canceled|bye)$/i.test(clean(values[i]?.[status])) || /^(bye|walkover)$/i.test(a) || /^(bye|walkover)$/i.test(b)){state='skipped';issue='Already played, started, cancelled or a bye.';}
  else if(!a || !b || [a,b].some(team=>/^(winner\b|loser\b|tbd\b|tba\b|pending\b|unknown\b|#|0$|[-—]$)/i.test(team))){state='waiting';issue='Waiting for both team names to resolve in the sheet.';}
  else if(a.toLocaleLowerCase()===b.toLocaleLowerCase()){state='invalid';issue='Both teams are the same.';}
  if((state==='ready' || state==='waiting') && password_status==='missing'){state='invalid';issue='Add the match password on the first team row.';}
  else if((state==='ready' || state==='waiting') && password_status==='invalid'){state='invalid';issue='Use a password of 4–128 characters without leading or trailing spaces.';}
  if(clean(values[i+1]?.[id]) && clean(values[i+1]?.[id])!==source_id){state='invalid';issue='Two-row match has conflicting IDs.';}
  if(clean(values[i+1]?.[fmt]) && clean(values[i+1]?.[fmt]).toLowerCase().replace(/\s/g,'')!==rawFormat){state='invalid';issue='Two-row match has conflicting formats.';}
  if(firstPassword.trim() && secondPassword.trim() && firstPassword!==secondPassword){state='invalid';issue='Two-row match has conflicting passwords.';password=null;password_status='invalid';}
  rows.push({source_id,round,team_a:a,team_b:b,format,row:i+1,status:state,issue,password_status,password});i++;
 }
 const counts=new Map<string,number>();for(const row of rows)if(row.source_id)counts.set(row.source_id,(counts.get(row.source_id)||0)+1);
 for(const row of rows)if((counts.get(row.source_id)||0)>1){row.status='invalid';row.issue='Duplicate MapVETO Match ID in this tab.';}
 if(rows.length>500)throw new Error('Import at most 500 matches per day tab.');
 return rows;
}
