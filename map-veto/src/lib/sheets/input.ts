import {z} from 'zod';
import {spreadsheetId} from './parse';

export const optionalSpreadsheetId=z.string().trim().max(300).nullable().optional().transform((value,context)=>{
 if(value===undefined)return undefined;
 if(!value)return null;
 try{return spreadsheetId(value);}catch{
  context.addIssue({code:'custom',message:'Paste a Google Sheets URL or valid spreadsheet ID.'});
  return z.NEVER;
 }
});
