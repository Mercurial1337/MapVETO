import {csvValues} from './parse';
export interface SheetTab {id:number;title:string;}
async function publicText(url:string) {
 const response=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new Error('Cannot read sheet. Enable link viewing or share it with the Google service account.');
 const text=await response.text();if(text.length>2_000_000)throw new Error('Sheet response is too large.');return text;
}
async function client(){
 if(!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY)return null;
 const {google}=await import('googleapis');
 const auth=new google.auth.JWT({email:process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL.trim(),key:process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g,'\n'),scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']});
 return google.sheets({version:'v4',auth});
}
export async function listTabs(id:string):Promise<SheetTab[]> {
 const api=await client();
 if(api){const response=await api.spreadsheets.get({spreadsheetId:id,fields:'sheets.properties'});return (response.data.sheets||[]).map(sheet=>({id:sheet.properties!.sheetId!,title:sheet.properties!.title!})).filter(tab=>/^D\d+\s*-\s*Matches$/i.test(tab.title));}
 const html=await publicText(`https://docs.google.com/spreadsheets/d/${id}/htmlview`);
 const tabs=[...html.matchAll(/items\.push\(\{name: "((?:\\.|[^"\\])*)", pageUrl: "(?:\\.|[^"\\])*", gid: "(\d+)"/g)].map(match=>({id:Number(match[2]),title:JSON.parse('"'+match[1]+'"')})).filter(tab=>/^D\d+\s*-\s*Matches$/i.test(tab.title));
 if(!tabs.length)throw new Error('No readable D1 - Matches style day tabs found.');return tabs;
}
export async function readTab(id:string,tab:SheetTab):Promise<unknown[][]> {
 const api=await client();
 if(api){const response=await api.spreadsheets.values.get({spreadsheetId:id,range:`'${tab.title.replaceAll("'","''")}'!A1:AZ1100`,valueRenderOption:'FORMATTED_VALUE'});return response.data.values||[];}
 const text=await publicText(`https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${tab.id}`);
 if(/^\s*</.test(text))throw new Error('Google returned a sign-in page. Share the workbook for viewing.');return csvValues(text);
}
