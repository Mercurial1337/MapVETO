'use client';
import {useState,useSyncExternalStore} from 'react';
import type {VetoActor} from '@/types';
import {useRealtime} from '@/lib/realtime';
import {coinGif,canPlayCoinGif} from '@/lib/veto/coinPresentation';

const motionQuery='(prefers-reduced-motion: reduce)';
const subscribeMotion=(change:()=>void)=>{const query=window.matchMedia(motionQuery);query.addEventListener('change',change);return()=>query.removeEventListener('change',change);};
const reducedMotion=()=>window.matchMedia(motionQuery).matches;
const serverMotion=()=>true;

export function CoinTossPlayback({winner,revealAt,durationMs}:{winner:VetoActor;revealAt:string;durationMs:number}) {
 const {clock,clockReady}=useRealtime();
 const reduced=useSyncExternalStore(subscribeMotion,reducedMotion,serverMotion);
 const [media,setMedia]=useState<'loading'|'playing'|'unavailable'>('loading');
 const src=coinGif(winner),playable=clockReady && canPlayCoinGif(revealAt,durationMs,clock.now());
 // Mount the image only if a complete playback fits. GIFs cannot seek, so late
 // arrivals see the neutral waiting panel instead of an incorrect partial replay.
 const [started,setStarted]=useState(false);
 return <section className="match-panel w-full max-w-xl mx-auto text-center" aria-labelledby="coin-playback-title" aria-busy="true">
  <h2 id="coin-playback-title" className="panel-head">Coin toss</h2>
  <div className="relative mx-auto flex items-center justify-center w-48 h-48 sm:w-64 sm:h-64" aria-hidden="true">
   {media==='loading' && !reduced && playable && <span className="absolute text-sm text-white/70">Loading coin toss…</span>}
   {!reduced && src && media!=='unavailable' && (started||playable) ?
    /* A native img preserves GIF playback; no optimizer, animation library, or polling. */
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" width={512} height={512} decoding="async" fetchPriority="high" className={`w-full h-full object-contain ${media==='playing'?'visible':'invisible'}`}
     onLoad={()=>{if(canPlayCoinGif(revealAt,durationMs,clock.now())){setStarted(true);setMedia('playing');}else setMedia('unavailable');}}
     onError={()=>setMedia('unavailable')}/>
    : <span className="text-sm text-white/70">Revealing the coin toss…</span>}
  </div>
  <p role="status" className="text-sm text-white/70">The winner will appear here, then choose Team A or Team B.</p>
 </section>;
}
