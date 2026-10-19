import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {COMPETITIVE_MAPS,ALL_MAPS} from '../src/lib/maps/pools.ts';
process.loadEnvFile('.env.local');
// Requires a production build/server, matching database environment and Summit reference data.
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const base=process.env.TEST_APP_URL || 'http://localhost:3001',id=randomUUID();
try {
 const {data:template,error}=await db.from('veto_templates').select('id,game_id').eq('format','bo3').eq('is_default',true).single();assert.ifError(error);
 const {data:maps,error:mapError}=await db.from('maps').select('id,name').eq('game_id',template.game_id).eq('is_active',true);assert.ifError(mapError);
 assert.deepEqual(maps.map(map=>map.name).sort(),[...ALL_MAPS].sort());
 assert.ifError((await db.from('matches').insert({id,veto_template_id:template.id,team_a_name:'Codex Images Alpha',team_b_name:'Codex Images Beta',format:'bo3',status:'ready_check'})).error);
 const {data:initial,error:stateError}=await db.from('match_state').select('available_maps').eq('match_id',id).single();assert.ifError(stateError);
 assert.deepEqual(maps.filter(map=>initial.available_maps.includes(map.id)).map(map=>map.name).sort(),[...COMPETITIVE_MAPS].sort());
 // Render every catalog image, including maps retained for historical/custom pools.
 assert.ifError((await db.from('match_state').update({available_maps:maps.map(map=>map.id)}).eq('match_id',id)).error);
 const {data:link,error:linkError}=await db.from('match_links').select('token').eq('match_id',id).eq('link_type','observer').single();assert.ifError(linkError);
 const page=await fetch(`${base}/match/${id}?token=${link.token}`);assert.equal(page.status,200);
 const html=await page.text(),images=html.match(/<img\b[^>]*>/g) || [];
 for(const map of maps) {
  const tag=images.find(tag=>tag.includes(`alt="${map.name}"`));assert.ok(tag,`Missing image for ${map.name}`);
  const src=tag.match(/\ssrc="([^"]+)"/)?.[1];assert.ok(src);
  const url=new URL(src.replaceAll('&amp;','&'),base);
  assert.ok(url.searchParams.get('url')?.startsWith('/_next/static/media/'),`${map.name} must use a versioned image, including lowercase database paths`);
  url.searchParams.set('w','256');
  const response=await fetch(url,{headers:{Accept:'image/webp'}});assert.equal(response.status,200,map.name);
  assert.match(response.headers.get('cache-control'),/immutable/,map.name);
  assert.match(response.headers.get('content-type'),/^image\//);
  assert.ok((await response.arrayBuffer()).byteLength<30000,`${map.name} thumbnail should be small`);
 }
 console.log('PASS map images: exact 13-map catalog and 7-map default pool, all images render with hashed URLs, lowercase paths resolve directly, optimized thumbnails have immutable cache headers and are below 30 KB');
} finally {assert.ifError((await db.from('matches').delete().eq('id',id)).error);}
