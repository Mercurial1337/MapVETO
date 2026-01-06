'use client';

import { useSearchParams, useParams } from 'next/navigation';
import { Suspense, useMemo } from 'react';
import { motion } from 'framer-motion';
import { MapCard } from '@/components/match/MapCard';
import { VetoTimeline, TurnIndicator } from '@/components/match/VetoTimeline';
import { CoinTossModal } from '@/components/match/CoinTossModal';
import { RealtimeProvider, useMatchData, useVetoActions, useConnectionStatus } from '@/lib/realtime';
import type { MapCardState, GameMap, VetoStep, VetoActor, Match, VetoTemplate } from '@/types';

// Extended match type that includes joined data from Supabase
interface MatchWithTemplate extends Match {
    veto_templates?: Pick<VetoTemplate, 'id' | 'name' | 'format' | 'sequence'>;
}

// Placeholder maps for demo (will be replaced by real data)
const PLACEHOLDER_MAPS: GameMap[] = [
    { id: '1', game_id: 'val', name: 'Abyss', slug: 'abyss', image_url: 'https://images.unsplash.com/photo-1614851099175-e5b30eb6f696?w=800&h=450&fit=crop', callout_image_url: null, is_active: true, metadata: {}, created_at: '' },
    { id: '2', game_id: 'val', name: 'Bind', slug: 'bind', image_url: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=800&h=450&fit=crop', callout_image_url: null, is_active: true, metadata: {}, created_at: '' },
    { id: '3', game_id: 'val', name: 'Haven', slug: 'haven', image_url: 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=800&h=450&fit=crop', callout_image_url: null, is_active: true, metadata: {}, created_at: '' },
    { id: '4', game_id: 'val', name: 'Pearl', slug: 'pearl', image_url: 'https://images.unsplash.com/photo-1557683316-973673baf926?w=800&h=450&fit=crop', callout_image_url: null, is_active: true, metadata: {}, created_at: '' },
    { id: '5', game_id: 'val', name: 'Corrode', slug: 'corrode', image_url: 'https://images.unsplash.com/photo-1509114397022-ed747cca3f65?w=800&h=450&fit=crop', callout_image_url: null, is_active: true, metadata: {}, created_at: '' },
    { id: '6', game_id: 'val', name: 'Split', slug: 'split', image_url: 'https://images.unsplash.com/photo-1534796636912-3b95b3ab5986?w=800&h=450&fit=crop', callout_image_url: null, is_active: true, metadata: {}, created_at: '' },
    { id: '7', game_id: 'val', name: 'Sunset', slug: 'sunset', image_url: 'https://images.unsplash.com/photo-1495616811223-4d98c6e9c869?w=800&h=450&fit=crop', callout_image_url: null, is_active: true, metadata: {}, created_at: '' },
];

function MatchVetoInterface() {
    const { match, state, isLoading, error } = useMatchData();
    const { banMap, pickMap, pickSide, coinToss, isSubmitting } = useVetoActions();
    const { isConnected } = useConnectionStatus();

    // In production, maps come from match.veto_templates or map pool
    const maps = PLACEHOLDER_MAPS;

    const templateSteps: VetoStep[] = useMemo(() => {
        const matchExt = match as MatchWithTemplate | null;
        if (!matchExt?.veto_templates?.sequence) {
            // Default Bo3 steps
            return [
                { step: 1, action: 'ban', actor: 'team_a', description: 'Team A bans' },
                { step: 2, action: 'ban', actor: 'team_b', description: 'Team B bans' },
                { step: 3, action: 'pick', actor: 'team_a', map_number: 1, description: 'Team A picks' },
                { step: 4, action: 'side', actor: 'team_b', map_number: 1, description: 'Team B side' },
                { step: 5, action: 'pick', actor: 'team_b', map_number: 2, description: 'Team B picks' },
                { step: 6, action: 'side', actor: 'team_a', map_number: 2, description: 'Team A side' },
                { step: 7, action: 'ban', actor: 'team_a', description: 'Team A bans' },
                { step: 8, action: 'ban', actor: 'team_b', description: 'Team B bans' },
                { step: 9, action: 'decider', actor: 'system', map_number: 3, description: 'Decider' },
                { step: 10, action: 'side', actor: 'team_a', map_number: 3, description: 'Team A side' },
            ];
        }
        return matchExt.veto_templates.sequence.steps || [];
    }, [match]);

    const currentStepDef = state ? templateSteps[state.current_step] : null;

    // Determine if it's user's turn (simplified - in production check against token)
    const isMyTurn = (turn: VetoActor | null) => {
        // This would check against the user's token-derived team
        return turn === 'team_a'; // Placeholder
    };

    // Determine map states
    const mapStates = useMemo(() => {
        if (!state) return {};

        const states: Record<string, { state: MapCardState; side?: 'attack' | 'defense'; pickedBy?: string; mapNumber?: number }> = {};

        state.banned_maps.forEach(ban => {
            states[ban.map_id] = { state: 'banned' };
        });

        state.picked_maps.forEach(pick => {
            states[pick.map_id] = {
                state: 'picked',
                side: pick.side || undefined,
                pickedBy: pick.picked_by === 'team_a'
                    ? match?.team_a_name
                    : pick.picked_by === 'team_b'
                        ? match?.team_b_name
                        : 'Decider',
                mapNumber: pick.map_number
            };
        });

        state.available_maps.forEach(mapId => {
            if (!states[mapId]) {
                states[mapId] = { state: isMyTurn(state.current_turn) ? 'active' : 'available' };
            }
        });

        return states;
    }, [state, match, isMyTurn]);

    // Handle map selection
    const handleMapSelect = async (mapId: string) => {
        if (!currentStepDef || isSubmitting) return;

        if (currentStepDef.action === 'ban') {
            await banMap(mapId);
        } else if (currentStepDef.action === 'pick') {
            await pickMap(mapId);
        }
    };

    // Show coin toss modal
    const showCoinToss = match?.status === 'coin_toss';

    // Loading state
    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    className="w-12 h-12 border-4 border-white/20 border-t-purple-500 rounded-full"
                />
            </div>
        );
    }

    // Error state
    if (error || !match) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center glass rounded-2xl p-8">
                    <h1 className="text-2xl font-bold text-red-400 mb-2">Error</h1>
                    <p className="text-white/60 mb-4">{error || 'Match not found'}</p>
                    <a href="/" className="btn-primary px-6 py-2 rounded-xl inline-block">
                        Go Home
                    </a>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex flex-col">
            {/* Header */}
            <header className="glass-dark border-b border-white/10 px-6 py-4">
                <div className="max-w-7xl mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <h1 className="gradient-text text-2xl font-bold">MAP VETO</h1>
                        <div className={`px-3 py-1 rounded-full text-xs font-medium ${isConnected ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'
                            }`}>
                            {isConnected ? '● Live' : '○ Connecting...'}
                        </div>
                    </div>
                    <div className="text-sm text-white/60">
                        {match.format.toUpperCase()}
                    </div>
                </div>
            </header>

            {/* Teams Banner */}
            <div className="bg-black/40 border-b border-white/5 px-6 py-6">
                <div className="max-w-4xl mx-auto flex items-center justify-center gap-8">
                    <div className="text-center">
                        <h2 className="text-2xl font-bold text-white">{match.team_a_name}</h2>
                        <span className="text-xs text-red-400 uppercase tracking-wider">Team A</span>
                    </div>
                    <div className="text-4xl font-light text-white/30">VS</div>
                    <div className="text-center">
                        <h2 className="text-2xl font-bold text-white">{match.team_b_name}</h2>
                        <span className="text-xs text-blue-400 uppercase tracking-wider">Team B</span>
                    </div>
                </div>
            </div>

            {/* Turn Indicator */}
            {currentStepDef && match.status === 'in_progress' && (
                <div className="flex justify-center py-6">
                    <TurnIndicator
                        currentStep={currentStepDef}
                        teamAName={match.team_a_name}
                        teamBName={match.team_b_name}
                        isMyTurn={state ? isMyTurn(state.current_turn) : false}
                    />
                </div>
            )}

            {/* Map Gallery */}
            <div className="flex-1 flex items-center px-4 py-6">
                <div className="w-full overflow-x-auto scrollbar-hide">
                    <div className="flex gap-6 px-4 min-w-max justify-center">
                        {maps.map((map) => {
                            const mapState = mapStates[map.id] || { state: 'available' as MapCardState };
                            const canInteract = state !== null &&
                                isMyTurn(state.current_turn) &&
                                mapState.state === 'active' &&
                                !isSubmitting &&
                                match.status === 'in_progress';

                            return (
                                <MapCard
                                    key={map.id}
                                    map={map}
                                    state={mapState.state}
                                    side={mapState.side}
                                    pickedBy={mapState.pickedBy}
                                    mapNumber={mapState.mapNumber}
                                    teamColor={mapState.pickedBy === match.team_a_name ? '#ef4444' : mapState.pickedBy === match.team_b_name ? '#3b82f6' : '#8b5cf6'}
                                    canInteract={canInteract}
                                    onSelect={() => handleMapSelect(map.id)}
                                />
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Side Selection */}
            {currentStepDef?.action === 'side' && state && isMyTurn(state.current_turn) && (
                <motion.div
                    initial={{ opacity: 0, y: 50 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="fixed bottom-8 left-1/2 -translate-x-1/2 glass-dark rounded-2xl p-6 flex gap-4"
                >
                    <button
                        onClick={() => pickSide('attack')}
                        disabled={isSubmitting}
                        className="badge-attack px-8 py-4 text-lg disabled:opacity-50"
                    >
                        ⚔️ Attack
                    </button>
                    <button
                        onClick={() => pickSide('defense')}
                        disabled={isSubmitting}
                        className="badge-defense px-8 py-4 text-lg disabled:opacity-50"
                    >
                        🛡️ Defense
                    </button>
                </motion.div>
            )}

            {/* Timeline */}
            <div className="glass-dark border-t border-white/10">
                <VetoTimeline
                    steps={templateSteps}
                    currentStep={state?.current_step || 0}
                    teamAName={match.team_a_name}
                    teamBName={match.team_b_name}
                />
            </div>

            {/* Coin Toss Modal */}
            <CoinTossModal
                isOpen={showCoinToss}
                teamAName={match.team_a_name}
                teamBName={match.team_b_name}
                onComplete={async (winner) => {
                    await coinToss();
                }}
            />

            {/* Completed Banner */}
            {state?.is_complete && (
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="fixed top-20 left-1/2 -translate-x-1/2 bg-green-500/90 text-white px-8 py-4 rounded-2xl shadow-xl"
                >
                    <p className="text-lg font-bold">✓ Veto Complete!</p>
                </motion.div>
            )}
        </div>
    );
}

function MatchPageContent() {
    const params = useParams();
    const searchParams = useSearchParams();
    const matchId = params.id as string;
    const token = searchParams.get('token') || '';

    // If no token, show demo mode
    if (!token || token === 'demo-token') {
        // Import and use the demo version
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center glass rounded-2xl p-8">
                    <h1 className="text-2xl font-bold text-white mb-4">Demo Mode</h1>
                    <p className="text-white/60 mb-6">
                        Access this page with a valid magic link token to join a match.
                    </p>
                    <a href="/admin" className="btn-primary px-6 py-2 rounded-xl inline-block">
                        Go to Admin
                    </a>
                </div>
            </div>
        );
    }

    return (
        <RealtimeProvider matchId={matchId} token={token}>
            <MatchVetoInterface />
        </RealtimeProvider>
    );
}

export default function MatchPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center">
                <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    className="w-12 h-12 border-4 border-white/20 border-t-purple-500 rounded-full"
                />
            </div>
        }>
            <MatchPageContent />
        </Suspense>
    );
}
