import assert from 'node:assert/strict';
import {CountdownSound} from '../src/lib/veto/countdownSound.ts';
let created=0,resumed=0,closed=0;
const oscillators=[],gains=[];
const param=()=>({values:[],setValueAtTime(value){this.values.push(value);},exponentialRampToValueAtTime(value){this.values.push(value);},linearRampToValueAtTime(value){this.values.push(value);}});
const context={state:'suspended',currentTime:0,destination:{},resume(){resumed++;this.state='running';return Promise.resolve();},close(){closed++;this.state='closed';return Promise.resolve();},createOscillator(){const oscillator={frequency:param(),connect(){},disconnect(){},start(){this.started=true;},stop(){this.stops=(this.stops || 0)+1;}};oscillators.push(oscillator);return oscillator;},createGain(){const gain={gain:param(),connect(){},disconnect(){}};gains.push(gain);return gain;}};
const sound=new CountdownSound(()=>{created++;return context;});
sound.tick('turn-1',15);assert.equal(created,0);assert.equal(oscillators.length,0);
sound.unlock();assert.equal(created,1);assert.equal(resumed,1);
for(const seconds of [60,16,0,-1,NaN,1.5])sound.tick('turn-1',seconds);
sound.tick('',15);assert.equal(oscillators.length,0);
for(let seconds=15;seconds>=1;seconds--){sound.tick('turn-1',seconds);sound.tick('turn-1',seconds);}
assert.equal(oscillators.length,30,'exactly one two-tone tick per second, despite duplicate updates');
assert.ok(gains[20].gain.values[1]>gains[0].gain.values[1],'last five seconds are slightly more urgent');
sound.stop();assert.ok(oscillators.every(oscillator=>oscillator.stops===2),'pause/turn cleanup stops all active voices');
context.state='suspended';sound.tick('turn-2',15);assert.equal(oscillators.length,30,'no queued audio when suspended');
sound.unlock();sound.tick('turn-2',15);assert.equal(oscillators.length,32,'new turn can warn at the same remaining second');
sound.dispose();assert.equal(closed,1);sound.unlock();sound.tick('turn-3',15);assert.equal(created,1);assert.equal(oscillators.length,32);
console.log('PASS countdown audio: gesture unlock, only seconds 15–1, duplicate suppression, final-five urgency, stopped voices on pause/turn cleanup, suspended context and unmount cleanup');
