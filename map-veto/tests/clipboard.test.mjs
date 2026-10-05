import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {copyText,matchLinkUrls,MATCH_LINK_ROLES} from '../src/lib/clipboard.ts';
const id=randomUUID(),raw=Object.fromEntries(MATCH_LINK_ROLES.map(role=>[role,{token:randomUUID()}]));
const links=matchLinkUrls(raw,'https://mapveto.example',id);
for(const role of MATCH_LINK_ROLES) {
 const url=new URL(links[role]);assert.equal(url.pathname,`/match/${id}`);assert.equal(url.searchParams.get('token'),raw[role].token);
}
for(const broken of [[],{},null,{...raw,admin:{token:''}},{...raw,team_a:{token:'undefined'}}])assert.throws(()=>matchLinkUrls(broken,'https://mapveto.example',id),/unavailable/);
let clipboard='',writes=0;
Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard:{writeText:async text=>{clipboard=text;writes++;}}}});
await assert.rejects(copyText(''),/unavailable/);await assert.rejects(copyText('  '),/unavailable/);assert.equal(writes,0);
for(const link of Object.values(links)){await copyText(link);assert.equal(clipboard,link);}
// Exercise denied/unavailable native copying, selection fallback, cleanup and truthful failure.
globalThis.HTMLElement=class{};
let appended=false,removed=false,focused=false,selected=false,fallbackResult=true;
const previous=new HTMLElement();previous.focus=()=>{focused=true;};
globalThis.document={activeElement:previous,body:{appendChild:()=>{appended=true;}},createElement:()=>({value:'',style:{},setAttribute:()=>{},focus:()=>{},select(){selected=true;clipboard=this.value;},remove(){removed=true;}}),execCommand:command=>{assert.equal(command,'copy');return fallbackResult;}};
navigator.clipboard.writeText=async()=>{throw new Error('Permission denied');};
await copyText(links.team_a);assert.equal(clipboard,links.team_a);assert.ok(appended && removed && selected && focused);
fallbackResult=false;removed=false;await assert.rejects(copyText(links.admin),/Copy failed/);assert.ok(removed);
delete navigator.clipboard;fallbackResult=true;await copyText(links.observer);assert.equal(clipboard,links.observer);
console.log('PASS clipboard: all four full links, missing/empty links rejected, exact contents, denied/unavailable API fallback, failed copy reported and focus restored');
