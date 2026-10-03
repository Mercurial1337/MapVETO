import { createServiceClient } from '@/lib/supabase/server';
import Link from 'next/link';
import Image from 'next/image';

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
        .single();
        
    if (matchError || !match) {
        return (
            <div className="min-h-screen flex items-center justify-center text-center px-4">
                <div className="glass p-8 rounded-2xl max-w-md w-full">
                    <h1 className="text-xl font-bold text-red-400 mb-2">Match Not Found</h1>
                    <p className="text-white/60">This match doesn't exist or hasn't been completed yet.</p>
                </div>
            </div>
        );
    }

    // Only allow completed matches
    if (match.status !== 'completed') {
        return (
            <div className="min-h-screen flex items-center justify-center text-center px-4">
                <div className="glass p-8 rounded-2xl max-w-md w-full">
                    <h1 className="text-xl font-bold text-yellow-400 mb-2">Match Not Completed</h1>
                    <p className="text-white/60">The veto process for this match is still ongoing.</p>
                </div>
            </div>
        );
    }

    // Fetch Logs
    const { data: logs, error: logsError } = await supabase
        .from('match_logs')
        .select('*, maps(name)')
        .eq('match_id', matchId)
        .order('step_number', { ascending: true })
        .order('created_at', { ascending: true });

    // Helper to get actor name
    const getActorName = (actor: string) => {
        if (actor === 'team_a') return match.team_a_name;
        if (actor === 'team_b') return match.team_b_name;
        return 'System';
    };

    // Helper to generate the log text
    const generateLogText = (log: any) => {
        const actorName = getActorName(log.actor);
        const mapName = log.maps?.name || 'Unknown Map';

        switch (log.action_type) {
            case 'ban':
                return `${actorName} banned ${mapName}`;
            case 'pick':
                return `${actorName} picked ${mapName}`;
            case 'side_pick':
                const side = log.metadata?.side;
                const sideText = side === 'attack' ? 'ATK' : 'DEF';
                return `${actorName} chose ${sideText} on ${mapName}`;
            case 'decider':
                return `Decider Map: ${mapName}`;
            default:
                return null;
        }
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
            <div className="w-full max-w-lg bg-white/5 border border-white/10 rounded-2xl overflow-hidden p-6 font-mono text-sm leading-relaxed text-white/90">
                {logs?.length === 0 ? (
                    <div className="text-center text-white/50">No logs found for this match.</div>
                ) : (
                    <div className="space-y-2">
                        {logs?.map((log, index) => {
                            // Don't show side picks if they are pending or empty
                            if (log.action_type === 'side_pick' && (!log.metadata || !log.metadata.side)) return null;
                            if (log.action_type === 'coin_toss') return null; // usually omit coin toss from standard text output or keep it if desired
                            
                            return (
                                <div key={log.id} className="flex gap-4">
                                    <span className="text-white/30 shrink-0 select-none">
                                        {(index + 1).toString().padStart(2, '0')}.
                                    </span>
                                    <span>
                                        {generateLogText(log)}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
            
        </div>
    );
}
