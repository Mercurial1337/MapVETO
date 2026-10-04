import { createServiceClient } from '@/lib/supabase/server';
import Link from 'next/link';
import type { Match, MatchState, VetoTemplate, VetoActor, SideChoice } from '@/types';
interface LogEntry {type:'ban'|'pick'|'side'|'decider';actor:VetoActor;mapName:string;side?:SideChoice;}

interface PageProps {
    params: Promise<{ matchId: string }>;
}

export default async function PublicMatchLogPage({ params }: PageProps) {
    const supabase = createServiceClient();
    const { matchId } = await params;

    // Fetch Match Data
    const { data: match, error: matchError } = await supabase
        .from('matches')
        .select('*, events(name)')
        .eq('id', matchId)
        .single<Match & {event_id:string|null;events:{name:string}|null}>();

    if (matchError || !match) {
        return (
            <div className="min-h-screen flex items-center justify-center text-center px-4">
                <div className="glass p-8 rounded max-w-md w-full">
                    <h1 className="text-xl font-bold text-red-400 mb-2">Match Not Found</h1>
                    <p className="text-white/60">This match doesn&apos;t exist or hasn&apos;t been completed yet.</p>
                </div>
            </div>
        );
    }

    // Only allow completed matches
    if (match.status !== 'completed') {
        return (
            <div className="min-h-screen flex items-center justify-center text-center px-4">
                <div className="glass p-8 rounded max-w-md w-full">
                    <h1 className="text-xl font-bold text-yellow-400 mb-2">Match Not Completed</h1>
                    <p className="text-white/60">The veto process for this match is still ongoing.</p>
                </div>
            </div>
        );
    }

    // Fetch Match State
    const { data: state } = await supabase
        .from('match_state')
        .select('*')
        .eq('match_id', matchId)
        .single<MatchState>();

    // Fetch Sequence
    let sequence = match.custom_veto_sequence;
    if (!sequence && match.veto_template_id) {
        const { data: template } = await supabase
            .from('veto_templates')
            .select('sequence')
            .eq('id', match.veto_template_id)
            .single<Pick<VetoTemplate,'sequence'>>();
        if (template) sequence = template.sequence;
    }

    // Fetch Map Names
    const { data: mapsData } = await supabase.from('maps').select('id, name');
    const mapNames = (mapsData || []).reduce<Record<string,string>>((acc, m) => {
        acc[m.id] = m.name;
        return acc;
    }, {});

    const getActorName = (actor: string) => {
        if (actor === 'team_a') return match.team_a_name;
        if (actor === 'team_b') return match.team_b_name;
        return 'System';
    };

    const vetoSteps = sequence?.steps || [];
    const bannedMaps = state?.banned_maps || [];
    const pickedMaps = state?.picked_maps || [];

    // Reconstruct the exact log sequence as ActionLog.tsx
    const entries: LogEntry[] = [];
    let banIndex = 0;

    for (let i = 0; i < vetoSteps.length && i < (state?.current_step || 0); i++) {
        const step = vetoSteps[i];

        if (step.action === 'ban') {
            const ban = bannedMaps[banIndex];
            if (ban) {
                entries.push({
                    type: 'ban',
                    actor: ban.banned_by,
                    mapName: mapNames[ban.map_id] || 'Unknown',
                });
                banIndex++;
            }
        } else if (step.action === 'pick') {
            const pick = pickedMaps.find(p => p.map_number === step.map_number);
            if (pick) {
                entries.push({
                    type: 'pick',
                    actor: pick.picked_by,
                    mapName: mapNames[pick.map_id] || 'Unknown',
                });
            }
        } else if (step.action === 'side') {
            const pick = pickedMaps.find(p => p.map_number === step.map_number);
            if (pick && pick.side) {
                entries.push({
                    type: 'side',
                    actor: pick.side_picked_by || step.actor,
                    mapName: mapNames[pick.map_id] || 'Unknown',
                    side: pick.side,
                });
            }
        } else if (step.action === 'decider') {
            const pick = pickedMaps.find(p => p.map_number === step.map_number);
            if (pick) {
                entries.push({
                    type: 'decider',
                    actor: 'system',
                    mapName: mapNames[pick.map_id] || 'Unknown',
                });
            }
        }
    }

    const generateLogText = (entry: LogEntry) => {
        const actorName = getActorName(entry.actor);
        if (entry.type === 'ban') {
            return `${actorName} banned ${entry.mapName}`;
        } else if (entry.type === 'pick') {
            return `${actorName} picked ${entry.mapName}`;
        } else if (entry.type === 'side') {
            const sideText = entry.side === 'attack' ? 'Attack' : 'Defense';
            return `${actorName} picked ${sideText} for ${entry.mapName}`;
        } else if (entry.type === 'decider') {
            return `${entry.mapName} was left as the Decider`;
        }
        return '';
    };

    return (
        <div className="min-h-screen flex flex-col items-center py-12 px-4 max-w-2xl mx-auto">

            {/* Header */}
            <div className="w-full mb-8 text-center">
                {match.event_id && (
                    <div className="mb-4">
                        <Link
                            href={`/events/${match.event_id}`}
                            className="text-sm text-cyan-400 hover:text-cyan-300 transition-colors"
                        >
                            ← Back to {match.events?.name || 'Event'}
                        </Link>
                    </div>
                )}

                <h1 className="text-2xl font-bold text-white mb-1">Match Veto Log</h1>
                <div className="flex items-center justify-center gap-3 text-lg font-medium text-white/80">
                    <span>{match.team_a_name}</span>
                    <span className="text-sm text-white/30">vs</span>
                    <span>{match.team_b_name}</span>
                </div>
                <div className="text-xs text-white/40 mt-2 uppercase tracking-wider">
                    {match.format} Format • Completed
                </div>
            </div>

            {/* Action Log List */}
            <div className="w-full max-w-lg bg-white/5 border border-white/10 rounded overflow-hidden p-6 font-mono text-sm leading-relaxed text-white/90">
                {entries.length === 0 ? (
                    <div className="text-center text-white/50">No logs found for this match.</div>
                ) : (
                    <div className="space-y-3">
                        {entries.map((entry, index) => (
                            <div key={index} className="flex gap-4">
                                <span className="text-white/30 shrink-0 select-none">
                                    {(index + 1).toString().padStart(2, '0')}.
                                </span>
                                <span>
                                    {generateLogText(entry)}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

        </div>
    );
}
