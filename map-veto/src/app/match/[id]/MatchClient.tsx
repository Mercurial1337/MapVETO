'use client';

import { useSearchParams, useParams } from 'next/navigation';
import { Suspense, useMemo, useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapCard } from '@/components/match/MapCard';
import { VetoTimeline, TurnIndicator } from '@/components/match/VetoTimeline';
import { TurnTimer } from '@/components/match/TurnTimer';
import { CoinTossModal } from '@/components/match/CoinTossModal';
import { PositionSelectionModal } from '@/components/match/PositionSelectionModal';
import { SideSelectionModal } from '@/components/match/SideSelectionModal';
import { ReadyCheckModal } from '@/components/match/ReadyCheckModal';
import { ActionLog } from '@/components/match/ActionLog';
import { AdminPanel } from '@/components/match/AdminPanel';
import { RealtimeProvider, useMatchData, useVetoActions, useConnectionStatus } from '@/lib/realtime';
import { createClient } from '@/lib/supabase/client';
import { useActionSound } from '@/hooks';
import type { MapCardState, VetoStep, VetoActor, Match, MatchState, VetoTemplate, GameMap } from '@/types';

// Map name to local image fallback
const MAP_IMAGE_FALLBACKS: Record<string, string> = {
    'Abyss': '/maps/valorant/Abyss.webp',
    'Bind': '/maps/valorant/Bind.webp',
    'Haven': '/maps/valorant/Haven.webp',
    'Pearl': '/maps/valorant/Pearl.webp',
    'Corrode': '/maps/valorant/Corrode.webp',
    'Split': '/maps/valorant/Split.webp',
    'Sunset': '/maps/valorant/Sunset.webp',
    'Ascent': '/maps/valorant/Ascent.webp',
    'Icebox': '/maps/valorant/Icebox.webp',
    'Breeze': '/maps/valorant/Breeze.webp',
    'Fracture': '/maps/valorant/Fracture.webp',
    'Lotus': '/maps/valorant/Lotus.webp',
};

// Extended match type that includes joined data from Supabase
interface MatchWithTemplate extends Omit<Match, 'coin_toss_winner'> {
    veto_templates?: Pick<VetoTemplate, 'id' | 'name' | 'format' | 'sequence'>;
    coin_toss_winner?: VetoActor | null;
}

interface MatchVetoInterfaceProps {
    token: string;
    matchId: string;
}

function MatchVetoInterface({ token, matchId }: MatchVetoInterfaceProps) {
    const { match, state, maps, logs, eventBranding, isLoading, error, userRole } = useMatchData();
    const { banMap, pickMap, pickSide, coinToss, readyUp, isSubmitting } = useVetoActions();
    const { isConnected } = useConnectionStatus();
    const [isAdmin, setIsAdmin] = useState(false);
    const [selectedMapId, setSelectedMapId] = useState<string | null>(null);

    // Play notification sounds on state changes (turn changes, completion)
    useActionSound({
        state: state ?? null,
        userRole,
        isInProgress: match?.status === 'in_progress',
    });

    // Check if current user is an admin
    // Check if current user is an admin
    useEffect(() => {
        const checkAdmin = async () => {
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();
            setIsAdmin(!!user);
        };
        checkAdmin();
    }, []);

    // Completion banner logic
    const [showCompletedBanner, setShowCompletedBanner] = useState(false);
    useEffect(() => {
        if (state?.is_complete) {
            setShowCompletedBanner(true);
            const timer = setTimeout(() => setShowCompletedBanner(false), 5000);
            return () => clearTimeout(timer);
        }
    }, [state?.is_complete]);

    // Reset map selection when the veto step advances
    useEffect(() => {
        setSelectedMapId(null);
    }, [state?.current_step]);

    // Load custom font if event has one
    useEffect(() => {
        if (eventBranding?.custom_font_url && eventBranding?.custom_font_name) {
            const fontFace = new FontFace(
                eventBranding.custom_font_name,
                `url(${eventBranding.custom_font_url})`
            );
            fontFace.load().then((loadedFont) => {
                document.fonts.add(loadedFont);
                document.body.style.fontFamily = `"${eventBranding.custom_font_name}", sans-serif`;
            }).catch((err) => {
                console.error('Failed to load custom font:', err);
            });

            return () => {
                document.body.style.fontFamily = '';
            };
        }
    }, [eventBranding?.custom_font_url, eventBranding?.custom_font_name]);

    // Get the coin toss winner from match data
    const matchExt = match as MatchWithTemplate | null;
    const coinTossWinner = matchExt?.coin_toss_winner;

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

    // Get displayed team names and logos based on actor_mapping
    // After position choice, teams may have swapped roles
    const displayedTeams = useMemo(() => {
        const actorMapping = state?.actor_mapping;
        if (!actorMapping || !match) {
            // No mapping, use original names and logos
            return {
                teamA: match?.team_a_name || 'Team A',
                teamB: match?.team_b_name || 'Team B',
                logoA: match?.team_a_logo || null,
                logoB: match?.team_b_logo || null,
            };
        }
        // Find which real team plays as template team_a
        const realTeamPlayingAsA = Object.entries(actorMapping).find(
            ([, role]) => role === 'team_a'
        )?.[0] as 'team_a' | 'team_b' | undefined;

        if (realTeamPlayingAsA === 'team_a') {
            // No swap needed
            return {
                teamA: match.team_a_name,
                teamB: match.team_b_name,
                logoA: match.team_a_logo || null,
                logoB: match.team_b_logo || null,
            };
        } else {
            // team_b is playing as Team A, swap names and logos
            return {
                teamA: match.team_b_name,
                teamB: match.team_a_name,
                logoA: match.team_b_logo || null,
                logoB: match.team_a_logo || null,
            };
        }
    }, [state?.actor_mapping, match]);

    // Get team name for current turn
    const getCurrentTurnTeamName = useCallback(() => {
        if (!state?.current_turn || !match) return '';
        // current_turn is the real team (token holder)
        return state.current_turn === 'team_a' ? match.team_a_name : match.team_b_name;
    }, [state?.current_turn, match]);

    // Determine if it's user's turn based on their token role
    const isMyTurn = useCallback((turn: VetoActor | null) => {
        if (!userRole || userRole === 'observer') return false;
        return turn === userRole;
    }, [userRole]);

    // Determine map states
    const mapStates = useMemo(() => {
        if (!state) return {};

        const states: Record<string, { state: MapCardState; side?: 'attack' | 'defense'; pickedBy?: string; sidePickedBy?: string; mapNumber?: number }> = {};

        state.banned_maps.forEach(ban => {
            states[ban.map_id] = { state: 'banned' };
        });

        state.picked_maps.forEach(pick => {
            // picked_by is the actual team (link holder) who picked the map
            // We use the original match team names (not swapped displayedTeams)
            // because picked_by stores the real team identity
            const pickedByName = pick.picked_by === 'team_a'
                ? match?.team_a_name
                : pick.picked_by === 'team_b'
                    ? match?.team_b_name
                    : 'Decider';

            // Get who picked the side
            const sidePickedByName = pick.side_picked_by === 'team_a'
                ? match?.team_a_name
                : pick.side_picked_by === 'team_b'
                    ? match?.team_b_name
                    : undefined;

            states[pick.map_id] = {
                state: 'picked',
                side: pick.side || undefined,
                pickedBy: pickedByName,
                sidePickedBy: sidePickedByName,
                mapNumber: pick.map_number
            };
        });

        state.available_maps.forEach(mapId => {
            if (!states[mapId]) {
                states[mapId] = {
                    state: state.is_complete
                        ? 'banned'
                        : (isMyTurn(state.current_turn) ? 'active' : 'available')
                };
            }
        });

        return states;
    }, [state, match, isMyTurn]);

    // Handle map selection (first click = select, confirm button = execute)
    const handleMapSelect = (mapId: string) => {
        if (!currentStepDef || isSubmitting) return;
        setSelectedMapId(prev => prev === mapId ? null : mapId);
    };

    // Handle confirm action (execute the ban/pick)
    const handleConfirm = async () => {
        if (!selectedMapId || !currentStepDef || isSubmitting) return;

        if (currentStepDef.action === 'ban') {
            await banMap(selectedMapId);
        } else if (currentStepDef.action === 'pick') {
            await pickMap(selectedMapId);
        }
        setSelectedMapId(null);
    };

    // === Coin Toss Modal Visibility ===
    // Managed by local state. Opens when match status is 'coin_toss'.
    // Stays open until CoinTossModal signals that the animation is complete.
    const [coinTossModalOpen, setCoinTossModalOpen] = useState(false);

    // Open modal when match status is 'coin_toss'
    useEffect(() => {
        if (match?.status === 'coin_toss') {
            setCoinTossModalOpen(true);
        }
    }, [match?.status]);

    // Called by CoinTossModal after the full animation sequence finishes
    const handleCoinTossAnimationComplete = useCallback(() => {
        setCoinTossModalOpen(false);
    }, []);

    const showCoinToss = coinTossModalOpen;

    // Ready Check Modal
    const showReadyCheck = match?.status === 'ready_check';

    // Position selection modal: only show after coin toss modal has closed
    const showPositionSelection = match?.status === 'side_selection' && !coinTossModalOpen;

    // Get maps with fallback images and filter based on the current pool
    const mapsWithImages = useMemo(() => {
        if (!state) return [];

        // Combine all maps that are part of the current match's pool
        const poolMapIds = new Set([
            ...state.available_maps,
            ...state.banned_maps.map(b => b.map_id),
            ...state.picked_maps.map(p => p.map_id)
        ]);

        return maps
            .filter(map => poolMapIds.has(map.id))
            .map(map => ({
                ...map,
                image_url: map.image_url || MAP_IMAGE_FALLBACKS[map.name] || '/maps/valorant/default.webp'
            }));
    }, [maps, state]);

    // Create map name lookup
    const mapNames = useMemo(() => {
        const lookup: Record<string, string> = {};
        maps.forEach(map => {
            lookup[map.id] = map.name;
        });
        return lookup;
    }, [maps]);

    // Check if we're in a side selection step and get the map that needs side picking
    const pendingSidePickMap = useMemo(() => {
        if (!currentStepDef || currentStepDef.action !== 'side' || !state) return null;
        const pickedMap = state.picked_maps.find(pm => pm.map_number === currentStepDef.map_number);
        if (pickedMap && !pickedMap.side) {
            return {
                mapId: pickedMap.map_id,
                mapName: mapNames[pickedMap.map_id] || 'Unknown',
            };
        }
        return null;
    }, [currentStepDef, state, mapNames]);

    // Show side selection modal
    const showSideSelection = pendingSidePickMap !== null && isMyTurn(state?.current_turn || null);

    // Block map interaction during side pick
    const isSidePicking = currentStepDef?.action === 'side';

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
            <header className="glass-dark border-b border-white/10 px-4 md:px-6 py-3 md:py-4">
                <div className="max-w-7xl mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-2 md:gap-4">
                        {eventBranding?.logo_url ? (
                            <img
                                src={eventBranding.logo_url}
                                alt="Event Logo"
                                className="h-12 md:h-16 object-contain max-w-[200px] md:max-w-[280px]"
                            />
                        ) : (
                            <img
                                src="/CLASH26 PLATFORM HEADER.png"
                                alt="EMEA Clash"
                                className="h-12 md:h-16 object-contain max-w-[200px] md:max-w-[280px]"
                            />
                        )}
                        <div className={`px-2 md:px-3 py-1 rounded-full text-xs font-medium ${isConnected ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'
                            }`}>
                            {isConnected ? '● Live' : '○ Connecting...'}
                        </div>
                    </div>
                    <div className="text-xs md:text-sm text-white/60">
                        {match.format.toUpperCase()}
                    </div>
                </div>
            </header>

            {/* Teams Banner */}
            <div className="bg-black/40 border-b border-white/5 px-4 md:px-6 py-4 md:py-6">
                <div className="max-w-4xl mx-auto flex items-center justify-center gap-4 md:gap-8">
                    <div className="text-center flex-1 md:flex-none flex items-center justify-end gap-3">
                        {displayedTeams.logoA && (
                            <img
                                src={displayedTeams.logoA}
                                alt={displayedTeams.teamA}
                                className="w-10 h-10 md:w-14 md:h-14 rounded-lg object-contain flex-shrink-0"
                            />
                        )}
                        <div>
                            <h2 className="text-base md:text-2xl font-bold text-white truncate">{displayedTeams.teamA}</h2>
                            <span className="text-xs text-[#00FFFF] uppercase tracking-wider font-semibold">Team A</span>
                        </div>
                    </div>
                    <div className="text-2xl md:text-4xl font-light text-white/30">VS</div>
                    <div className="text-center flex-1 md:flex-none flex items-center justify-start gap-3">
                        <div>
                            <h2 className="text-base md:text-2xl font-bold text-white truncate">{displayedTeams.teamB}</h2>
                            <span className="text-xs text-[#CCFF00] uppercase tracking-wider font-semibold">Team B</span>
                        </div>
                        {displayedTeams.logoB && (
                            <img
                                src={displayedTeams.logoB}
                                alt={displayedTeams.teamB}
                                className="w-10 h-10 md:w-14 md:h-14 rounded-lg object-contain flex-shrink-0"
                            />
                        )}
                    </div>
                </div>
            </div>

            {/* Turn Indicator */}
            {currentStepDef && match.status === 'in_progress' && (
                <div className="flex flex-col items-center gap-3 py-6">
                    <TurnIndicator
                        currentStep={currentStepDef}
                        teamAName={displayedTeams.teamA}
                        teamBName={displayedTeams.teamB}
                        isMyTurn={state ? isMyTurn(state.current_turn) : false}
                    />
                    {/* Turn Timer for all users */}
                    <TurnTimer
                        currentStep={currentStepDef}
                        stateUpdatedAt={state?.updated_at ?? ''}
                        teamAName={displayedTeams.teamA}
                        teamBName={displayedTeams.teamB}
                        isInProgress={match.status === 'in_progress'}
                        isComplete={state?.is_complete ?? false}
                        matchId={matchId}
                    />
                </div>
            )}

            {/* Main Content - Map Gallery + Action Log */}
            <div className="flex-1 flex flex-col lg:flex-row px-2 md:px-4 py-4 md:py-6 gap-4">
                {/* Map Gallery */}
                <div className="flex-1 flex flex-col items-start lg:items-center justify-center gap-4">
                    <div className="flex flex-wrap gap-2 md:gap-3 justify-center max-w-5xl">
                        {mapsWithImages.map((map) => {
                            const mapState = mapStates[map.id] || { state: 'available' as MapCardState };
                            const isAvailableMap = mapState.state === 'active' || mapState.state === 'available';
                            // Block interaction during side pick
                            const canInteract = state !== null &&
                                isMyTurn(state.current_turn) &&
                                isAvailableMap &&
                                !isSubmitting &&
                                !isSidePicking &&
                                match.status === 'in_progress';

                            return (
                                <MapCard
                                    key={map.id}
                                    map={map}
                                    state={mapState.state}
                                    side={mapState.side}
                                    sidePickedBy={mapState.sidePickedBy}
                                    pickedBy={mapState.pickedBy}
                                    mapNumber={mapState.mapNumber}
                                    teamColor={mapState.pickedBy === displayedTeams.teamA ? '#ef4444' : mapState.pickedBy === displayedTeams.teamB ? '#3b82f6' : '#8b5cf6'}
                                    canInteract={canInteract}
                                    onSelect={() => handleMapSelect(map.id)}
                                    action={currentStepDef?.action}
                                    isSelected={selectedMapId === map.id}
                                />
                            );
                        })}
                    </div>

                    {/* Confirm Bar */}
                    <AnimatePresence>
                        {selectedMapId && currentStepDef && (currentStepDef.action === 'ban' || currentStepDef.action === 'pick') && (
                            <motion.div
                                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: 20, scale: 0.95 }}
                                transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                                className="flex items-center gap-4 glass rounded-xl px-5 py-3"
                            >
                                <span className="text-white/80 text-sm font-medium">
                                    {mapNames[selectedMapId] || 'Map'}
                                </span>
                                <button
                                    onClick={handleConfirm}
                                    disabled={isSubmitting}
                                    className={`px-8 py-2.5 rounded-lg font-bold text-white text-sm uppercase tracking-wider transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                                        currentStepDef.action === 'ban'
                                            ? 'bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 shadow-lg shadow-red-500/25'
                                            : 'bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 shadow-lg shadow-green-500/25'
                                    }`}
                                >
                                    {isSubmitting ? 'Confirming...' : 'Confirm'}
                                </button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Action Log Panel */}
                <div className="w-full lg:w-64 glass rounded-xl p-4 mt-4 lg:mt-0">
                    <h3 className="text-sm font-semibold text-white/70 mb-3 uppercase tracking-wider">Action Log</h3>
                    <ActionLog
                        logs={logs || []}
                        dbTeamAName={match.team_a_name}
                        dbTeamBName={match.team_b_name}
                        displayTeam1Name={displayedTeams.teamA}
                        displayTeam2Name={displayedTeams.teamB}
                        mapNames={mapNames}
                    />
                </div>
            </div>

            {/* Timeline */}
            <div className="glass-dark border-t border-white/10">
                <VetoTimeline
                    steps={templateSteps}
                    currentStep={state?.current_step || 0}
                    teamAName={displayedTeams.teamA}
                    teamBName={displayedTeams.teamB}
                />
            </div>

            {/* Side Selection Modal */}
            <SideSelectionModal
                isOpen={showSideSelection}
                mapName={pendingSidePickMap?.mapName || ''}
                teamName={getCurrentTurnTeamName()}
                onSelect={pickSide}
                isSubmitting={isSubmitting}
            />

            {/* Ready Check Modal */}
            <ReadyCheckModal
                isOpen={showReadyCheck}
                teamAName={match.team_a_name}
                teamBName={match.team_b_name}
                teamAReady={state?.team_a_ready || false}
                teamBReady={state?.team_b_ready || false}
                userRole={userRole}
                onReady={readyUp}
            />

            {/* Coin Toss Modal */}
            <CoinTossModal
                isOpen={showCoinToss}
                teamAName={match.team_a_name}
                teamBName={match.team_b_name}
                isAdmin={isAdmin}
                winner={coinTossWinner}
                isSeeded={!!match.coin_toss_forced}
                onFlip={coinToss}
                onAnimationComplete={handleCoinTossAnimationComplete}
                userRole={userRole}
            />

            {/* Position Selection Modal */}
            <PositionSelectionModal
                isOpen={showPositionSelection}
                teamAName={match.team_a_name}
                teamBName={match.team_b_name}
                coinTossWinner={coinTossWinner || null}
                userRole={userRole}
                token={token}
                matchId={matchId}
                isSeeded={!!match.coin_toss_forced}
            />

            {/* Completed Banner */}
            <AnimatePresence>
                {showCompletedBanner && (
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="fixed top-20 left-1/2 -translate-x-1/2 bg-green-500/90 text-white pl-8 pr-4 py-4 rounded-2xl shadow-xl flex items-center gap-4 z-50 backdrop-blur-sm"
                    >
                        <p className="text-lg font-bold">✓ Veto Complete!</p>
                        <button
                            onClick={() => setShowCompletedBanner(false)}
                            className="p-1 hover:bg-white/20 rounded-full transition-colors"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Admin Panel */}
            {isAdmin && match && (
                <AdminPanel matchId={matchId} matchStatus={match.status} isPaused={state?.is_paused} />
            )}
        </div>
    );
}

export interface MatchClientProps {
    matchId: string;
    token: string;
    initialData: {
        match: Match | null;
        state: MatchState | null;
        maps: GameMap[];
        logs: any[];
        eventBranding: any | null;
        userRole: any;
    };
}

export default function MatchClient({ matchId, token, initialData }: MatchClientProps) {
    if (!token || token === 'demo-token') {
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
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center">
                <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    className="w-12 h-12 border-4 border-white/20 border-t-purple-500 rounded-full"
                />
            </div>
        }>
            <RealtimeProvider matchId={matchId} token={token} initialData={initialData}>
                <MatchVetoInterface token={token} matchId={matchId} />
            </RealtimeProvider>
        </Suspense>
    );
}
