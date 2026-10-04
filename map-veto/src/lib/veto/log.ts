import type { MatchLog } from '@/types';
export function formatLog(entry: MatchLog, teams: Record<string,string>, maps: Record<string,string>): string {
 const actor=teams[entry.actor] || (entry.actor==='admin'?'Referee':'System');
 const metadata=entry.metadata || {};
 const map=entry.map_id ? maps[entry.map_id] || entry.map_id : '';
 let text:string;
 switch(entry.action_type) {
  case 'ready_check':text=`${actor} confirmed ready`;break;
  case 'coin_toss':text=metadata.is_seeded?`${actor} has the higher seed`:`${actor} won the coin toss${metadata.forced_by_admin?' (referee result)':''}`;break;
  case 'position_choice':text=`${actor} confirmed Team ${metadata.pick_first?'A':'B'}`;break;
  case 'ban':text=`${actor} confirmed ban: ${map}`;break;
  case 'pick':text=`${actor} confirmed pick: ${map}`;break;
  case 'side':text=`${actor} confirmed ${entry.side_choice}: ${map}`;break;
  case 'decider':text=`Decider: ${map}`;break;
  case 'admin_action':text=`Referee ${metadata.action_details || 'override'}`;break;
  default:text=`${actor}: ${entry.action_type}`;
 }
 if(metadata.map_number) text+=` (map ${metadata.map_number})`;
 if(metadata.timeout) text+=' [timeout: random selection]';
 else if(metadata.is_auto) text+=' [automatic]';
 if(metadata.admin_override) text+=' [referee override]';
 if(metadata.superseded) text+=' [superseded]';
 if(metadata.previous_session) text+=' [previous session]';
 return `${entry.created_at} — ${text}`;
}
