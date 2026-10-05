import type { MatchLog } from '@/types';
export function formatLog(entry: MatchLog, teams: Record<string,string>, maps: Record<string,string>): string {
 const actor=teams[entry.actor] || (entry.actor==='admin'?'Head Admin':'System');
 const metadata=entry.metadata || {};
 const map=entry.map_id ? maps[entry.map_id] || entry.map_id : '';
 let text:string;
 switch(entry.action_type) {
  case 'ready_check':text=`${actor} confirmed ready`;break;
  case 'coin_toss':text=metadata.is_seeded?`${actor} has the higher seed`:`${actor} won the coin toss${metadata.automatic_coin_toss?' (automatic toss)':metadata.forced_by_admin?' (Head Admin result)':''}`;break;
  case 'position_choice':text=`${actor} confirmed Team ${metadata.pick_first?'A':'B'}`;break;
  case 'ban':text=`${actor} confirmed ban: ${map}`;break;
  case 'pick':text=`${actor} confirmed pick: ${map}`;break;
  case 'side':text=`${actor} confirmed ${entry.side_choice}: ${map}`;break;
  case 'decider':text=`Decider: ${map}`;break;
  case 'admin_action':text=`${metadata.staff_role==='referee'?'Referee (both teams approved)':'Head Admin'} ${metadata.action_details || 'override'}`;break;
  case 'reset_request':text=`Referee requested veto reset: ${metadata.reason || ''}`;break;
  case 'reset_answer':text=`${actor} ${metadata.approved?'approved':'declined'} the veto reset`;break;
  case 'timeout_request':text=`${actor} requested a timeout: ${metadata.reason || ''}`;break;
  case 'timeout_resolved':text=`Head Admin resolved ${teams[String(metadata.request_actor)] || 'the team'}'s timeout: ${metadata.resolution || ''}`;break;
  default:text=`${actor}: ${entry.action_type}`;
 }
 if(metadata.map_number) text+=` (map ${metadata.map_number})`;
 if(metadata.timeout) text+=' [move timer expired: random selection]';
 else if(metadata.is_auto) text+=' [automatic]';
 if(metadata.admin_override) text+=' [Head Admin override]';
 if(metadata.superseded) text+=' [superseded]';
 if(metadata.previous_session) text+=' [previous session]';
 return `${entry.created_at} — ${text}`;
}
