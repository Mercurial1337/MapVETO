// Render the actual synthesized app cues, plus two optional countdown candidates.
import {writeFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {CountdownSound} from '../src/lib/veto/countdownSound.ts';
import {NotificationSound} from '../src/lib/veto/notificationSound.ts';
const output=process.argv[2];if(!output)throw new Error('Provide an output directory');mkdirSync(output,{recursive:true});
const rate=44100;
function parameter() {
 const events=[];
 return {events,setValueAtTime(value,time){events.push({kind:'set',value,time});},linearRampToValueAtTime(value,time){events.push({kind:'linear',value,time});},exponentialRampToValueAtTime(value,time){events.push({kind:'exponential',value,time});}};
}
function valueAt(param,time) {
 let previous={value:0,time:0};
 for(const event of param.events) {
  if(time<event.time) {
   if(event.kind==='set')return previous.value;
   const progress=(time-previous.time)/(event.time-previous.time);
   return event.kind==='linear'?previous.value+(event.value-previous.value)*progress:previous.value*Math.pow(event.value/previous.value,progress);
  }
  previous=event;
 }
 return previous.value;
}
function context() {
 const voices=[];
 return {voices,state:'running',currentTime:0,destination:{},createOscillator(){const voice={frequency:parameter(),connect(gain){this.gain=gain.gain;},disconnect(){},start(time){this.startTime=time;},stop(time){this.stopTime=time;}};voices.push(voice);return voice;},createGain(){return {gain:parameter(),connect(){},disconnect(){}};}};
}
function save(name,ctx,duration) {
 const samples=new Float64Array(Math.ceil(rate*duration));
 for(const voice of ctx.voices) {
  let phase=0;
  for(let i=Math.ceil(voice.startTime*rate);i<Math.min(samples.length,Math.floor(voice.stopTime*rate));i++) {
   const time=i/rate;phase+=2*Math.PI*valueAt(voice.frequency,time)/rate;
   const wave=voice.type==='triangle'?2/Math.PI*Math.asin(Math.sin(phase)):Math.sin(phase);
   samples[i]+=wave*valueAt(voice.gain,time);
  }
 }
 const buffer=Buffer.alloc(44+samples.length*2);buffer.write('RIFF',0);buffer.writeUInt32LE(buffer.length-8,4);buffer.write('WAVEfmt ',8);buffer.writeUInt32LE(16,16);buffer.writeUInt16LE(1,20);buffer.writeUInt16LE(1,22);buffer.writeUInt32LE(rate,24);buffer.writeUInt32LE(rate*2,28);buffer.writeUInt16LE(2,32);buffer.writeUInt16LE(16,34);buffer.write('data',36);buffer.writeUInt32LE(samples.length*2,40);
 let peak=0;for(let i=0;i<samples.length;i++){peak=Math.max(peak,Math.abs(samples[i]));buffer.writeInt16LE(Math.round(Math.max(-1,Math.min(1,samples[i]))*32767),44+i*2);}
 if(!(peak>0 && peak<1))throw new Error('Invalid preview levels');
 writeFileSync(join(output,name+'.wav'),buffer);console.log(`${name}: ${duration}s, peak ${peak.toFixed(3)}`);
}
for(const cue of ['ready','turn','complete','attention']) {const ctx=context(),sound=new NotificationSound(()=>ctx);sound.unlock();sound.play(cue);save(cue,ctx,1.1);}
const current=context(),sound=new CountdownSound(()=>current);sound.unlock();for(let i=0;i<6;i++){current.currentTime=i;sound.tick('preview',15-i);}save('current-ticking',current,6);
for(const variant of ['deep-click','metallic-tick']) {
 const ctx=context();
 for(let i=0;i<6;i++)for(const harmonic of [1,1.48]) {
  const voice=ctx.createOscillator(),gain=ctx.createGain(),time=i,pitch=(variant==='deep-click'?650:1300)*(i%2?0.8:1)*harmonic;
  voice.type=variant==='deep-click'?'triangle':'sine';voice.frequency.setValueAtTime(pitch,time);voice.frequency.exponentialRampToValueAtTime(pitch*0.75,time+0.06);
  gain.gain.setValueAtTime(0,time);gain.gain.linearRampToValueAtTime(0.09/harmonic,time+0.001);gain.gain.exponentialRampToValueAtTime(0.0001,time+(variant==='deep-click'?0.035:0.095));voice.connect(gain);voice.start(time);voice.stop(time+0.1);
 }
 save(variant,ctx,6);
}
