import type {Match,MatchLog} from '@/types';

// Colours belong to the original links, before the winner chooses Team A/B.
export function coinVideo(winner:Match['coin_toss_winner']) {
 return winner==='team_a'?'/coin-toss/green-wins.mp4':winner==='team_b'?'/coin-toss/purple-wins.mp4':null;
}
export function coinRevealKey(match:Match|null):string|null {
 return match?.status==='side_selection' && !match.coin_toss_forced && coinVideo(match.coin_toss_winner)
  && (match.coin_toss_animation_ms||0)>0 && match.coin_toss_reveal_at && Number.isFinite(Date.parse(match.coin_toss_reveal_at))
  ? `${match.id}:${match.coin_toss_reveal_at}`:null;
}
export function canPlayCoinVideo(revealAt:string,duration:number,now:number|null) {
 return now!==null && duration>0 && Date.parse(revealAt)-now>=duration;
}
export function hideCoinResult(logs:MatchLog[],hidden:boolean) {
 return hidden?logs.filter(log=>log.action_type!=='coin_toss' && !(log.action_type==='admin_action' && log.metadata?.winner)):logs;
}
