'use client';
import {useEffect,useRef,useState,useSyncExternalStore} from 'react';
import type {VetoActor} from '@/types';
import {useRealtime} from '@/lib/realtime';
import {coinVideo,canPlayCoinVideo} from '@/lib/veto/coinPresentation';

const motionQuery='(prefers-reduced-motion: reduce)';
const subscribeMotion=(change:()=>void)=>{const query=window.matchMedia(motionQuery);query.addEventListener('change',change);return()=>query.removeEventListener('change',change);};
const reducedMotion=()=>window.matchMedia(motionQuery).matches;
const serverMotion=()=>true;

interface Props {matchId:string;winner:VetoActor;revealAt:string;durationMs:number;onPlaybackStart:()=>void;onPlaybackFinish:()=>void;}
export function CoinTossPlayback({matchId,winner,revealAt,durationMs,onPlaybackStart,onPlaybackFinish}:Props) {
 const {clock,clockReady}=useRealtime();
 const reduced=useSyncExternalStore(subscribeMotion,reducedMotion,serverMotion);
 const [media,setMedia]=useState<'loading'|'playing'|'ended'|'unavailable'>('loading');
 const video=useRef<HTMLVideoElement>(null),started=useRef(false),attempted=useRef(false),watchdog=useRef<ReturnType<typeof setTimeout>|null>(null);
 const src=coinVideo(winner),playable=clockReady && canPlayCoinVideo(revealAt,durationMs,clock.now());
 useEffect(()=>()=>{if(watchdog.current)clearTimeout(watchdog.current);},[]);
 function finish(failed=false){
  if(watchdog.current)clearTimeout(watchdog.current);
  if(failed)video.current?.pause();
  setMedia(failed?'unavailable':'ended');onPlaybackFinish();
 }
 function start(){
  const element=video.current;
  if(!element || attempted.current || reduced)return;
  attempted.current=true;
  // A refresh never replays this same toss. A new toss has a new reveal timestamp.
  try {if(sessionStorage.getItem(`vgveto:coin:${matchId}`)===revealAt){finish(true);return;}}catch{/* Storage is optional. */}
  if(!canPlayCoinVideo(revealAt,durationMs,clock.now())){finish(true);return;}
  element.play().catch(()=>finish(true));
 }
 function playing(){
  if(started.current)return;
  started.current=true;setMedia('playing');onPlaybackStart();
  try{sessionStorage.setItem(`vgveto:coin:${matchId}`,revealAt);}catch{/* Storage is optional. */}
  // Normal completion uses the ended event; a stalled decoder fails safely.
  watchdog.current=setTimeout(()=>finish(true),durationMs+4000);
 }
 return <section className="match-panel w-full max-w-xl mx-auto text-center" aria-labelledby="coin-playback-title" aria-busy="true">
  <h2 id="coin-playback-title" className="panel-head">Coin toss</h2>
  <div className="relative mx-auto flex items-center justify-center w-48 h-48 sm:w-64 sm:h-64" aria-hidden="true">
   {!reduced && src && media!=='unavailable' && (media==='playing'||media==='ended'||playable) ? <>
    {media==='loading' && <span className="absolute text-sm text-white/70">Loading coin toss…</span>}
    <video ref={video} src={src} width={448} height={448} muted playsInline preload="auto" controls={false} loop={false} disablePictureInPicture
     className={`w-full h-full object-contain ${media==='playing'||media==='ended'?'visible':'invisible'}`}
     onCanPlayThrough={start} onPlaying={playing} onEnded={()=>finish()} onError={()=>finish(true)}/>
   </> : <span className="text-sm text-white/70">Revealing the coin toss…</span>}
  </div>
  <p role="status" className="text-sm text-white/70">The winner will appear here, then choose Team A or Team B.</p>
 </section>;
}
