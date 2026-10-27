'use client';
import {useEffect,useState} from 'react';
import type {Match} from '@/types';
import {useRealtime} from '@/lib/realtime';
import {coinRevealKey} from '@/lib/veto/coinPresentation';

export function useCoinTossReveal(match:Match|null) {
 const {clock,clockReady}=useRealtime();
 const key=coinRevealKey(match),revealAt=match?.coin_toss_reveal_at;
 const [released,setReleased]=useState<string|null>(null);
 useEffect(()=>{
  if(!key || !revealAt || !clockReady)return;
  let timer:ReturnType<typeof setTimeout>;
  const check=()=>{clearTimeout(timer);const now=clock.now();if(now===null)return;
   const left=Date.parse(revealAt)-now;if(left<=0)setReleased(key);else timer=setTimeout(check,Math.min(left,1000));
  };
  timer=setTimeout(check,0);
  const recover=()=>{if(document.visibilityState==='visible')check();};
  window.addEventListener('focus',recover);document.addEventListener('visibilitychange',recover);
  return()=>{clearTimeout(timer);window.removeEventListener('focus',recover);document.removeEventListener('visibilitychange',recover);};
 },[key,revealAt,clock,clockReady]);
 return !!key && key!==released;
}
