import type { MatchLog } from '@/types';
export interface TimeoutRequest {
 id:string;actor:'team_a'|'team_b';reason:string;createdAt:string;
 acknowledgedAt?:string;acknowledgedRole?:'admin'|'referee';
 resolution?:string;resolvedAt?:string;
}
// The transactional audit entries also provide the live view of each request.
export function timeoutRequests(logs:MatchLog[]):TimeoutRequest[] {
 const requests=new Map<string,TimeoutRequest>();
 for(const log of logs) {
  const id=log.metadata?.timeout_request_id;
  if(typeof id!=='string') continue;
  if(log.action_type==='timeout_request' && (log.actor==='team_a' || log.actor==='team_b')) {
   requests.set(id,{id,actor:log.actor,reason:String(log.metadata?.reason || ''),createdAt:log.created_at});
  } else if(log.action_type==='timeout_acknowledged') {
   const report=requests.get(id);
   if(report) {report.acknowledgedAt=log.created_at;report.acknowledgedRole=log.metadata?.staff_role==='referee'?'referee':'admin';}
  } else if(log.action_type==='timeout_resolved') {
   const report=requests.get(id);
   if(report) {report.resolution=String(log.metadata?.resolution || '');report.resolvedAt=log.created_at;}
  }
 }
 return [...requests.values()].sort((a,b)=>Number(Boolean(a.resolvedAt))-Number(Boolean(b.resolvedAt)) || Date.parse(b.createdAt)-Date.parse(a.createdAt));
}
