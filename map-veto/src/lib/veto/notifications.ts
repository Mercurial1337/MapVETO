import type { Match, MatchState, MatchLog, LinkType } from '@/types';
export interface VetoNotice {kind:'info'|'success'|'warning';message:string;}
export function matchNotices(previous:{match:Match|null;state:MatchState|null},current:{match:Match|null;state:MatchState|null},role:LinkType|null):VetoNotice[] {
 const {match,state}=current,old=previous.state,oldMatch=previous.match;
 if(!match || !state || !old || !oldMatch || !role) return [];
 const notices:VetoNotice[]=[];
 if(!old.team_a_ready && state.team_a_ready && role!=='team_a') notices.push({kind:'info',message:`${match.team_a_name} checked in.`});
 if(!old.team_b_ready && state.team_b_ready && role!=='team_b') notices.push({kind:'info',message:`${match.team_b_name} checked in.`});
 if((!old.team_a_ready || !old.team_b_ready) && state.team_a_ready && state.team_b_ready) notices.push({kind:'success',message:'Both teams are ready.'});
 const starts=oldMatch.status!=='in_progress' && match.status==='in_progress';
 if(starts) notices.push({kind:'success',message:'The veto has started.'});
 if(oldMatch.status!=='side_selection' && match.status==='side_selection' && role===match.coin_toss_winner) notices.push({kind:'info',message:'Choose Team A or Team B within 60 seconds.'});
 if(match.status==='in_progress' && !state.is_complete && state.current_turn===role && (starts || old.current_step!==state.current_step || old.current_turn!==state.current_turn)) notices.push({kind:'info',message:'Your turn. Confirm your selection within 60 seconds.'});
 if(!old.is_complete && state.is_complete) notices.push({kind:'success',message:'The veto is complete.'});
 if(!old.is_paused && state.is_paused) notices.push({kind:'warning',message:'The Head Admin paused the veto.'});
 if(old.is_paused && !state.is_paused) notices.push({kind:'info',message:'The veto resumed.'});
 return notices;
}
export function timeoutNotice(log:MatchLog,match:Match):VetoNotice|null {
 if(!log.metadata?.timeout || log.metadata?.superseded || log.metadata?.previous_session) return null;
 const team=log.actor==='team_a'?match.team_a_name:match.team_b_name;
 return {kind:'warning',message:`${team}'s move timer expired. A random ${log.action_type==='position_choice'?'Team A/B assignment':log.action_type==='side'?'side':log.action_type} was confirmed.`};
}
export function requestNotice(log:MatchLog,match:Match,role:LinkType|null,canAdmin=false):VetoNotice|null {
 if(log.action_type==='timeout_request' && (role==='admin' || canAdmin)) return {kind:'warning',message:`${log.actor==='team_a'?match.team_a_name:match.team_b_name} requested a timeout. Open the Timeouts tab to review it.`};
 if(log.action_type==='timeout_resolved' && role===log.metadata?.request_actor) return {kind:'success',message:`The Head Admin resolved your timeout: ${String(log.metadata?.resolution || '')}`};
 return null;
}
