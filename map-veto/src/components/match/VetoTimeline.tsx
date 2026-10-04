'use client';
import type { VetoStep } from '@/types';
interface TimelineStep extends VetoStep {completed?:boolean;map_name?:string;side_choice?:string;}
interface Props {steps:TimelineStep[];currentStep:number;teamAName:string;teamBName:string;}
export function VetoTimeline({steps,currentStep,teamAName,teamBName}:Props) {
 return <ol aria-label="Veto steps" className="flex overflow-x-auto gap-2 px-4 py-3 text-xs">
  {steps.map((step,index)=><li key={step.step ?? index} aria-current={index===currentStep?'step':undefined} className={`shrink-0 px-3 py-2 border rounded ${index===currentStep?'border-yellow-400 text-yellow-300':index<currentStep?'border-green-700 text-green-300':'border-white/20 text-white/50'}`}>
   <span className="font-semibold">{index+1}. {step.action}</span><span className="block mt-1">{step.actor==='team_a'?teamAName:step.actor==='team_b'?teamBName:'System'}</span>
  </li>)}
 </ol>;
}
interface TurnProps {currentStep:VetoStep|null;teamAName:string;teamBName:string;isMyTurn:boolean;timeRemaining?:number;}
export function TurnIndicator({currentStep,teamAName,teamBName,isMyTurn}:TurnProps) {
 if(!currentStep)return null;
 const team=currentStep.actor==='team_a'?teamAName:currentStep.actor==='team_b'?teamBName:'System';
 return <p className="text-sm text-white/80">{isMyTurn?'Your turn':'Waiting for'} · <strong>{team}</strong> · {currentStep.action}</p>;
}
