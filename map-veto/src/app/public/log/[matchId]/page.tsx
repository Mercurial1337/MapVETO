import { createServiceClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { MapCard } from '@/components/match/MapCard';
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
    const { data: mapsData } = await supabase.from('maps').select('id, name, image_url');
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

    // Same map cards as the live veto: picked maps in playing order with team and side, bans greyed.
    const teamName = (actor?: string | null) => actor === 'team_a' ? match.team_a_name : actor === 'team_b' ? match.team_b_name : undefined;
    const poolIds = [...new Set([...(state?.available_maps || []), ...bannedMaps.map(b => b.map_id), ...pickedMaps.map(p => p.map_id)])];
    const cards = poolIds.map(id => {
        const pick = pickedMaps.find(p => p.map_id === id);
        const map = (mapsData || []).find(m => m.id === id);
        return { id, name: map?.name || 'Unknown', image_url: map?.image_url || '', pick };
    }).sort((x, y) => (x.pick?.map_number ?? 99) - (y.pick?.map_number ?? 99));

    return (
        <div className="min-h-screen flex flex-col min-w-0">
            <header className="border-b border-white/10 px-4 md:px-6 py-3 flex items-center justify-between gap-3">
                {match.event_id ? <Link href={`/events/${match.event_id}`} className="text-sm text-cyan-400 hover:text-cyan-300">← {match.events?.name || 'Event'}</Link> : <span />}
                <span className="text-xs md:text-sm text-white/60 uppercase">{match.format} · Veto complete</span>
            </header>
            <div className="bg-black/40 border-b border-white/5 px-4 md:px-6 py-4 md:py-6">
                <div className="max-w-4xl mx-auto flex items-center justify-center gap-3 md:gap-8">
                    <div className="flex-1 min-w-0 text-right"><h1 className="text-base md:text-2xl font-bold break-words">{match.team_a_name}</h1><span className="text-xs text-team-a uppercase tracking-wider font-semibold">Team A</span></div>
                    <div className="text-lg md:text-2xl text-white/30 shrink-0">VS</div>
                    <div className="flex-1 min-w-0"><h2 className="text-base md:text-2xl font-bold break-words">{match.team_b_name}</h2><span className="text-xs text-team-b uppercase tracking-wider font-semibold">Team B</span></div>
                </div>
            </div>
            <main className="flex-1 grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] items-start w-full max-w-[1600px] mx-auto px-4 md:px-6 py-4 md:py-6 gap-5">
                <div className="min-w-0 flex flex-col items-center gap-4">
                    <div className="flex flex-wrap gap-2 md:gap-3 justify-center w-full max-w-5xl">
                        {cards.map(card => (
                            <MapCard key={card.id} map={card} state={card.pick ? 'picked' : 'banned'} side={card.pick?.side} mapNumber={card.pick?.map_number}
                                pickedBy={card.pick ? teamName(card.pick.picked_by) || 'Decider' : undefined} sidePickedBy={teamName(card.pick?.side_picked_by)}
                                teamColor={card.pick?.picked_by === 'team_a' ? 'var(--team-a)' : card.pick?.picked_by === 'team_b' ? 'var(--team-b)' : 'var(--brand-mist)'} canInteract={false} />
                        ))}
                    </div>
                </div>
                <aside aria-label="Veto log" className="match-panel min-w-0">
                    <div className="panel-head"><h2>Veto log</h2></div>
                    {entries.length === 0 ? <p className="text-white/60">No selections recorded.</p> : (
                        <ol className="space-y-2 text-sm">
                            {entries.map((entry, index) => <li key={index} className="flex gap-3"><span className="text-white/40 shrink-0 tabular-nums">{String(index + 1).padStart(2, '0')}.</span><span>{generateLogText(entry)}</span></li>)}
                        </ol>
                    )}
                </aside>
            </main>
        </div>
    );
}
