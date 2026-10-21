import {createHash} from 'node:crypto';
import sharp from 'sharp';

export interface LogoTarget {sourceId:string;matchId:string;row:number;teamA:string;teamB:string;logoA:string|null;logoB:string|null;}
interface Options {
 targets:LogoTarget[];readImages:()=>Promise<Map<number,Uint8Array>>;
 store:(path:string,bytes:Uint8Array)=>Promise<string>;
 attach:(target:LogoTarget,logos:{team_a_logo?:string;team_b_logo?:string})=>Promise<void>;
 complete:(sourceId:string)=>Promise<void>;
 retry:(sourceIds:string[])=>Promise<void>;
}
/** Best-effort decoration after creation. Image/network/storage errors never undo matches. */
export async function importTeamLogos(options:Options) {
 if(!options.targets.length)return {attached:0,checked:0};
 let images:Map<number,Uint8Array>;
 try {images=await options.readImages();}
 catch {await options.retry(options.targets.map(t=>t.sourceId));return {attached:0,checked:0};}
 const cached=new Map<string,string>();let attached=0,checked=0;
 for(const target of options.targets){
  const logos:{team_a_logo?:string;team_b_logo?:string}={};let failed=false;
  for(const [key,row,existing] of [['team_a_logo',target.row,target.logoA],['team_b_logo',target.row+1,target.logoB]] as const){
   if(existing)continue;
   const image=images.get(row);if(!image)continue;
   try {
    const fingerprint=createHash('sha256').update(image).digest('hex');
    let url=cached.get(fingerprint);
    if(!url){
     const webp=await sharp(image,{limitInputPixels:16_000_000,animated:false}).rotate().resize(128,128,{fit:'inside',withoutEnlargement:true}).webp({quality:85}).toBuffer();
     const path=`sheet-team-logos/${createHash('sha256').update(webp).digest('hex')}.webp`;
     url=await options.store(path,webp);cached.set(fingerprint,url);
    }
    logos[key]=url;
   }catch{failed=true;}
  }
  try {
   if(Object.keys(logos).length){await options.attach(target,logos);attached+=Object.keys(logos).length;}
   if(failed)await options.retry([target.sourceId]);else{await options.complete(target.sourceId);checked++;}
  }catch{await options.retry([target.sourceId]);}
 }
 return {attached,checked};
}
