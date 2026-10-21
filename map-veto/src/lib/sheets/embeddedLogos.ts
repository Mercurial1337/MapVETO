import {unzipSync,strFromU8} from 'fflate';
import {XMLParser} from 'fast-xml-parser';
import {posix} from 'node:path';

const MAX_EXPORT=10*1024*1024;
const parser=new XMLParser({ignoreAttributes:false,removeNSPrefix:true,parseTagValue:false,processEntities:false});
const list=<T>(value:T|T[]|undefined):T[]=>value===undefined?[]:Array.isArray(value)?value:[value];
// XML has optional, variable-shaped OOXML elements; access is validated below.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Xml=Record<string,any>;
function text(value:unknown):string {
 if(typeof value==='string' || typeof value==='number')return String(value);
 if(value && typeof value==='object')return text((value as Xml)['#text']);
 return '';
}
/** Read anchored pictures in the LOGO column; never follow external relationships. */
export function embeddedLogos(bytes:Uint8Array,title:string,expectedTeams?:Map<number,string>):Map<number,Uint8Array> {
 if(bytes.length>MAX_EXPORT)throw new Error('Logo workbook exceeds 10 MB');
 let expanded=0,entries=0;
 const zip=unzipSync(bytes,{filter:file=>{
  if(++entries>10000 || file.originalSize>12*1024*1024 || (expanded+=file.originalSize)>50*1024*1024)throw new Error('Logo workbook is too large');
  return /^xl\/(?:workbook\.xml|_rels\/|worksheets\/|drawings\/|media\/|sharedStrings\.xml)/.test(file.name);
 }});
 const xml=(path:string):Xml=>{
  const data=zip[path];if(!data || data.length>4*1024*1024)throw new Error('Invalid logo workbook XML');
  const source=strFromU8(data);if(/<!DOCTYPE|<!ENTITY/i.test(source))throw new Error('Unsupported logo workbook XML');
  return parser.parse(source);
 };
 const relationships=(path:string):Map<string,string>=>{
  const relPath=posix.join(posix.dirname(path),'_rels',posix.basename(path)+'.rels');
  if(!zip[relPath])return new Map();
  const result=new Map<string,string>();
  for(const rel of list<Xml>(xml(relPath).Relationships?.Relationship)){
   if(rel['@_TargetMode']==='External')continue;
   const target=String(rel['@_Target']||'');
   if(/^[a-z]+:/i.test(target) || target.includes('\\'))continue;
   const resolved=target.startsWith('/')?posix.normalize(target.slice(1)):posix.normalize(posix.join(posix.dirname(path),target));
   if(resolved.startsWith('xl/'))result.set(String(rel['@_Id']),resolved);
  }
  return result;
 };
 const workbook=xml('xl/workbook.xml'),sheet=list<Xml>(workbook.workbook?.sheets?.sheet).find(s=>s['@_name']===title);
 const path=sheet && relationships('xl/workbook.xml').get(String(sheet['@_id']));
 if(!path)return new Map();
 const shared=zip['xl/sharedStrings.xml']?list<Xml>(xml('xl/sharedStrings.xml').sst?.si).map(si=>text(si.t)||list<Xml>(si.r).map(r=>text(r.t)).join('')):[];
 const data=xml(path).worksheet;
 const cellValue=(cell:Xml)=>cell['@_t']==='s'?shared[Number(text(cell.v))]:text(cell.is?.t)||text(cell.v);
 const columnIndex=(cell:Xml)=>[...(String(cell['@_r']).match(/^[A-Z]+/)?.[0]||'')].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0)-1;
 let logoColumn=-1,namesColumn=-1;
 for(const row of list<Xml>(data.sheetData?.row).slice(0,30))for(const cell of list<Xml>(row.c)){
  const value=cellValue(cell)?.trim().toLowerCase();
  if(value==='logo')logoColumn=columnIndex(cell);
  if(value==='names')namesColumn=columnIndex(cell);
 }
 if(logoColumn<0)return new Map();
 const names=new Map<number,string>();
 if(expectedTeams){for(const row of list<Xml>(data.sheetData?.row))for(const cell of list<Xml>(row.c))if(columnIndex(cell)===namesColumn)names.set(Number(row['@_r']),cellValue(cell)?.trim()||'');}
 const result=new Map<number,Uint8Array>(),ambiguous=new Set<number>(),sheetRels=relationships(path);
 for(const drawing of list<Xml>(data.drawing)){
  const drawingPath=sheetRels.get(String(drawing['@_id']));if(!drawingPath)continue;
  const drawingXml=xml(drawingPath).wsDr,drawingRels=relationships(drawingPath);
  for(const anchor of [...list<Xml>(drawingXml.oneCellAnchor),...list<Xml>(drawingXml.twoCellAnchor)]){
   const row=Number(text(anchor.from?.row))+1,col=Number(text(anchor.from?.col));
   if(!Number.isInteger(row) || row<1 || row>1100 || col!==logoColumn)continue;
   // A sheet edit between confirmation and export must not swap team identities.
   if(expectedTeams && (!expectedTeams.has(row) || expectedTeams.get(row)!==names.get(row)))continue;
   const pics=list<Xml>(anchor.pic);if(pics.length!==1)continue;
   const imagePath=drawingRels.get(String(pics[0].blipFill?.blip?.['@_embed']));
   if(!imagePath || !/^xl\/media\/[^/]+\.(png|jpe?g|webp|gif|avif)$/i.test(imagePath))continue;
   const image=zip[imagePath];if(!image || image.length>5*1024*1024)continue;
   if(result.has(row)){ambiguous.add(row);continue;}result.set(row,image);
  }
 }
 for(const row of ambiguous)result.delete(row);
 return result;
}
