import assert from 'node:assert/strict';
import {VetoClock,turnRemaining,nextTimerTick} from '../src/lib/veto/clock.ts';
const start=Date.parse('2026-10-08T12:00:00Z');
let elapsed=0;
const clocks=[-10000,10000,3600000].map(()=>new VetoClock(()=>elapsed));
for(const clock of clocks)assert.equal(clock.now(),null);
// Equal database clock sample with a 400 ms SQL request and 100 ms transit.
for(const clock of clocks)clock.synchronize(start+10450,0,500,400);
elapsed=500;
for(const clock of clocks)assert.equal(turnRemaining(new Date(start).toISOString(),clock.now()),50);
const wallClock=Date.now;Date.now=()=>start-3600000;
try {
 elapsed=1500;
 for(const clock of clocks)assert.equal(turnRemaining(new Date(start).toISOString(),clock.now()),49);
 elapsed=50000;
 for(const clock of clocks)assert.equal(turnRemaining(new Date(start).toISOString(),clock.now()),0);
}finally{Date.now=wallClock;}
assert.equal(turnRemaining('invalid',start),null);assert.equal(turnRemaining(new Date(start).toISOString(),null),null);
assert.equal(turnRemaining(new Date(start).toISOString(),start-10000),60);
assert.equal(nextTimerTick(new Date(start).toISOString(),start+59001),999);
assert.equal(nextTimerTick(new Date(start).toISOString(),start+59990),10);
assert.equal(turnRemaining(new Date(start).toISOString(),start+59999),1);
assert.equal(turnRemaining(new Date(start).toISOString(),start+60000),0);
assert.equal(clocks[0].synchronize(NaN,0,1),false);
console.log('PASS synchronized countdown: device skew/wall-clock jumps ignored, transit compensation, SQL time excluded, exact deadline and suspended-tab recovery');
