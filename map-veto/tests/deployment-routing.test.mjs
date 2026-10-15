import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {NextRequest,NextResponse} from 'next/server.js';

// Exercise the actual middleware with only its session-refresh dependency
// replaced. Requests retain their real host, URL and query parameters.
const source=ts.transpileModule(readFileSync('src/middleware.ts','utf8'),{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020},
}).outputText;
async function route(url,mode) {
 const exports={},refreshed=[];
 vm.runInNewContext(source,{
  exports,process:{env:{APP_ROUTING_MODE:mode}},
  require:name=>{
   if(name==='next/server')return {NextResponse};
   if(name==='@/lib/supabase/middleware')return {updateSession:async request=>{refreshed.push(request.nextUrl.pathname);return NextResponse.next();}};
   throw new Error(`Unexpected middleware dependency: ${name}`);
  },
 });
 const parsed=new URL(url);
 const response=await exports.middleware(new NextRequest(url,{headers:{host:parsed.host}}));
 return {response,refreshed};
}

for(const host of ['vgveto.com','www.vgveto.com','vgveto-preview.vercel.app']) {
 for(const path of ['/','/admin','/admin/events','/auth/callback']) {
  const {response,refreshed}=await route(`https://${host}${path}`,'standalone');
  assert.equal(response.headers.get('location'),null);assert.equal(response.headers.get('x-middleware-rewrite'),null);
  assert.deepEqual(refreshed,[path]);
 }
 for(const path of ['/match/fixture?token=example','/events/fixture','/api/veto/session','/maps/valorant/Haven.webp']) {
  const {response,refreshed}=await route(`https://${host}${path}`,'standalone');
  assert.equal(response.headers.get('location'),null);assert.equal(response.headers.get('x-middleware-rewrite'),null);
  assert.equal(refreshed.length,0,'Public/magic-link routes must not add an auth refresh');
 }
}
const landing=await route('https://emeaclash.com/');
assert.equal(landing.response.headers.get('x-middleware-rewrite'),'https://emeaclash.com/landing');
const oldLink=await route('https://emeaclash.com/match/fixture?token=example');
assert.equal(oldLink.response.headers.get('location'),'https://mapveto.emeaclash.com/match/fixture?token=example');
const oldAdmin=await route('https://mapveto.emeaclash.com/admin');
assert.deepEqual(oldAdmin.refreshed,['/admin']);assert.equal(oldAdmin.response.headers.get('location'),null);
const oldApi=await route('https://emeaclash.com/api/veto/session');
assert.equal(oldApi.response.headers.get('location'),null);
const local=await route('http://localhost:3001/admin');assert.deepEqual(local.refreshed,['/admin']);
console.log('PASS deployment routing: standalone apex/www/preview stay on their own host, staff login refresh, public routes add no auth call, EMEA landing and redirects preserved');
