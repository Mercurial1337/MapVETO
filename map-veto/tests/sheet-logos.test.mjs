import assert from 'node:assert/strict';
import {zipSync,strToU8} from 'fflate';
import sharp from 'sharp';
import {embeddedLogos} from '../src/lib/sheets/embeddedLogos.ts';
import {importTeamLogos} from '../src/lib/sheets/logoImport.ts';

const png=await sharp({create:{width:300,height:200,channels:4,background:'#ff3344'}}).png().toBuffer();
function workbook({external=false,duplicate=false,col=5,header='Logo',team='Alpha'}={}){
 const column=String.fromCharCode(65+col),names=String.fromCharCode(66+col);
 const anchor=(row,id)=>`<xdr:oneCellAnchor><xdr:from><xdr:col>${col}</xdr:col><xdr:row>${row-1}</xdr:row></xdr:from><xdr:pic><xdr:blipFill><a:blip r:embed="${id}"/></xdr:blipFill></xdr:pic></xdr:oneCellAnchor>`;
 const files={
  'xl/workbook.xml':'<workbook><sheets><sheet name="D2 - Matches" r:id="day"/></sheets></workbook>',
  'xl/_rels/workbook.xml.rels':'<Relationships><Relationship Id="day" Target="worksheets/sheet2.xml"/></Relationships>',
  'xl/sharedStrings.xml':`<sst><si><t>${header}</t></si><si><t>Names</t></si></sst>`,
  'xl/worksheets/sheet2.xml':`<worksheet><sheetData><row r="1"><c r="${column}1" t="s"><v>0</v></c><c r="${names}1" t="s"><v>1</v></c></row><row r="4"><c r="${names}4" t="str"><f>'Bracket View'!D301</f><v>${team}</v></c></row><row r="5"><c r="${names}5" t="inlineStr"><is><t>Beta</t></is></c></row></sheetData><drawing r:id="draw"/></worksheet>`,
  'xl/worksheets/_rels/sheet2.xml.rels':'<Relationships><Relationship Id="draw" Target="../drawings/drawing1.xml"/></Relationships>',
  'xl/drawings/drawing1.xml':`<xdr:wsDr>${anchor(4,'a')}${anchor(5,'b')}${duplicate?anchor(4,'b'):''}</xdr:wsDr>`,
  'xl/drawings/_rels/drawing1.xml.rels':`<Relationships><Relationship Id="a" Target="${external?'https://example.invalid/logo.png':'../media/image1.png'}" ${external?'TargetMode="External"':''}/><Relationship Id="b" Target="../media/image2.png"/></Relationships>`,
 };
 return zipSync({...Object.fromEntries(Object.entries(files).map(([k,v])=>[k,strToU8(v)])),'xl/media/image1.png':png,'xl/media/image2.png':png});
}
const expected=new Map([[4,'Alpha'],[5,'Beta']]);
const extracted=embeddedLogos(workbook(),'D2 - Matches',expected);
assert.deepEqual([...extracted.keys()],[4,5]);assert.deepEqual(extracted.get(4),new Uint8Array(png));
assert.equal(embeddedLogos(workbook({col:7}),'D2 - Matches',expected).size,2);
assert.equal(embeddedLogos(workbook({external:true}),'D2 - Matches',expected).has(4),false);
assert.equal(embeddedLogos(workbook({duplicate:true}),'D2 - Matches',expected).has(4),false);
assert.equal(embeddedLogos(workbook({team:'Changed opponent'}),'D2 - Matches',expected).has(4),false);
assert.equal(embeddedLogos(workbook({header:'Other'}),'D2 - Matches',expected).size,0);
assert.equal(embeddedLogos(workbook(),'D9 - Matches',expected).size,0);
assert.throws(()=>embeddedLogos(new Uint8Array(10*1024*1024+1),'D2 - Matches'),/10 MB/);
assert.throws(()=>embeddedLogos(strToU8('not a workbook'),'D2 - Matches'));

let exports=0,uploads=0;const attached=[],completed=[],retried=[];
const target={sourceId:'source',matchId:'match',row:4,teamA:'Alpha',teamB:'Beta',logoA:null,logoB:null};
const options={targets:[target],readImages:async()=>{exports++;return extracted;},store:async(path,bytes)=>{
 uploads++;assert.match(path,/^sheet-team-logos\/[a-f0-9]{64}\.webp$/);const meta=await sharp(bytes).metadata();assert.equal(meta.format,'webp');assert.ok(meta.width<=128 && meta.height<=128);return 'https://storage.example/'+path;
},attach:async(t,logos)=>attached.push({t,logos}),complete:async id=>completed.push(id),retry:async ids=>retried.push(...ids)};
assert.deepEqual(await importTeamLogos(options),{attached:2,checked:1});assert.equal(uploads,1,'same image bytes are optimized/uploaded once per batch');
assert.equal(attached[0].logos.team_a_logo,attached[0].logos.team_b_logo);assert.deepEqual(completed,['source']);
assert.deepEqual(await importTeamLogos({...options,targets:[]}),{attached:0,checked:0});assert.equal(exports,1,'no pending imports means no workbook download');
await importTeamLogos({...options,targets:[{...target,logoA:'https://existing/logo.webp'}]});assert.equal('team_a_logo' in attached.at(-1).logos,false);
await importTeamLogos({...options,readImages:async()=>new Map()});assert.equal(completed.length,3,'missing images complete without blocking');
await importTeamLogos({...options,readImages:async()=>{throw new Error('Google unavailable');}});assert.deepEqual(retried,['source']);
await importTeamLogos({...options,store:async()=>{throw new Error('Storage unavailable');}});assert.equal(retried.length,2);
await importTeamLogos({...options,readImages:async()=>new Map([[4,strToU8('invalid image')]])});assert.equal(retried.length,3);
console.log('PASS sheet logos: anchored pictures, shifted LOGO headers, row/team identity checks, external/ambiguous pictures ignored, bounded exports, 128px WebP, content-hash reuse, no export when idle, existing logos preserved, missing/corrupt/export/storage failures do not block matches');
