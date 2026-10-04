'use client';

import {
    createContext,
    useContext,
    useEffect,
    useState,
    useCallback,
    ReactNode,
} from 'react';
import { createClient } from '@/lib/supabase/client';
import type { MatchState, Match, VetoActor, SideChoice, GameMap, MatchLog } from '@/types';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { toast } from 'sonner';
import { useRef } from 'react';

interface EventBranding {
    logo_url: string | null;
    coin_image_url: string | null;
    custom_font_url: string | null;
    custom_font_name: string | null;
}

type UserRole = 'team_a' | 'team_b' | 'observer' | 'admin' | null;

interface RealtimeContextValue {
    // Match data
    match: Match | null;
    state: MatchState | null;
    maps: GameMap[];
    logs: MatchLog[];

    // Event branding
    eventBranding: EventBranding | null;

    // User role based on token
    userRole: UserRole;

    // Connection status
    isConnected: boolean;
    isLoading: boolean;
    error: string | null;

    // Actions
    performAction: (
        action: 'ban' | 'pick' | 'side',
        mapId?: string,
        sideChoice?: SideChoice
    ) => Promise<boolean>;

    // Coin toss
    performCoinToss: (forcedWinner?: VetoActor) => Promise<VetoActor | null>;

    // Ready Check
    performReady: () => Promise<boolean>;

    // Refresh
    refresh: () => Promise<void>;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

interface RealtimeProviderProps {
    matchId: string;
    token: string;
    initialData: {
        match: Match | null;
        state: MatchState | null;
        maps: GameMap[];
        logs: MatchLog[];
        eventBranding: EventBranding | null;
        userRole: UserRole;
    };
    children: ReactNode;
}

export function RealtimeProvider({ matchId, token, initialData, children }: RealtimeProviderProps) {
    const [match, setMatch] = useState<Match | null>(initialData.match);
    const [state, setState] = useState<MatchState | null>(initialData.state);
    const [maps, setMaps] = useState<GameMap[]>(initialData.maps);
    const [logs, setLogs] = useState<MatchLog[]>(initialData.logs);
    const [eventBranding, setEventBranding] = useState<EventBranding | null>(initialData.eventBranding);
    const [userRole, setUserRole] = useState<UserRole>(initialData.userRole);
    const [isConnected, setIsConnected] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const supabase = createClient();

    // Fetch data manually (for manual refresh)
    const fetchData = useCallback(async () => {
        try {
            // Fetch match and state with event if exists
            const { data: matchData, error: matchError } = await supabase
                .from('matches')
                .select(`
                    *,
                    match_state(*),
                    veto_templates(id, name, format, sequence, game_id),
                    events(logo_url, coin_image_url, custom_font_url, custom_font_name)
                `)
                .eq('id', matchId)
                .single();

            if (matchError) {
                setError('Match not found');
                return;
            }

            setMatch(matchData);

            // Set event branding if exists
            if (matchData.events) {
                setEventBranding(matchData.events as any);
            } else {
                setEventBranding(null);
            }
            setState(Array.isArray(matchData.match_state) ? matchData.match_state[0] : matchData.match_state);

            const { data: logsData } = await supabase
                .from('match_logs')
                .select('*')
                .eq('match_id', matchId)
                .order('created_at', { ascending: true });
            
            if (logsData) {
                setLogs(logsData as MatchLog[]);
            }

            // Fetch maps for this game
            if (matchData.veto_templates?.game_id) {
                const { data: mapsData } = await supabase
                    .from('maps')
                    .select('*')
                    .eq('game_id', matchData.veto_templates.game_id)
                    .eq('is_active', true);

                if (mapsData) {
                    setMaps(mapsData);
                }
            }

            setError(null);
        } catch (err) {
            setError('Failed to fetch match data');
        } finally {
            setIsLoading(false);
        }
    }, [matchId, token, supabase]);

    const prevMatchRef = useRef<Match | null>(null);
    const prevStateRef = useRef<MatchState | null>(null);

    // Notifications effect
    useEffect(() => {
        if (!match || !state || !userRole) return;
        
        const prevMatch = prevMatchRef.current;
        const prevState = prevStateRef.current;

        // The other team checks in
        if (prevState && !prevState.team_a_ready && state.team_a_ready && userRole !== 'team_a') {
            toast.info('Team A has checked in and is ready.');
        }
        if (prevState && !prevState.team_b_ready && state.team_b_ready && userRole !== 'team_b') {
            toast.info('Team B has checked in and is ready.');
        }

        // Both teams are ready
        if (prevState && (!prevState.team_a_ready || !prevState.team_b_ready) && state.team_a_ready && state.team_b_ready) {
            toast.success('Both teams are ready!');
        }

        // Veto starts
        if (prevMatch && prevMatch.status !== 'in_progress' && match.status === 'in_progress') {
            toast.success('The veto process has started!');
        }
        
        if (prevMatch && prevMatch.status !== 'coin_toss' && match.status === 'coin_toss') {
            toast.info('Coin toss phase has started.');
        }

        // Turn notifications
        if (prevState && prevState.current_turn !== state.current_turn && state.current_turn === userRole && !state.is_complete && match.status === 'in_progress') {
            toast.message("It's your turn!", { description: 'Please make your selection.' });
        }

        // Veto completed
        if (prevState && !prevState.is_complete && state.is_complete) {
            toast.success('The veto process is complete!');
        }

        prevMatchRef.current = match;
        prevStateRef.current = state;
    }, [match, state, userRole]);

    // Subscribe to realtime updates
    useEffect(() => {
        let channel: RealtimeChannel | null = null;

        const setupSubscription = async () => {
            // Subscribe to match_state changes and match updates via Broadcast
            channel = supabase
                .channel(`match:${matchId}`)
                .on(
                    'broadcast',
                    { event: 'match_state_update' },
                    (payload) => {
                        if (payload.payload) {
                            setState(payload.payload as MatchState);
                        }
                    }
                )
                .on(
                    'broadcast',
                    { event: 'match_update' },
                    (payload) => {
                        if (payload.payload) {
                            setMatch((prev) => (prev ? { ...prev, ...(payload.payload as Partial<Match>) } : null));
                        }
                    }
                )
                .on(
                    'broadcast',
                    { event: 'admin_veto_reset' },
                    () => {
                        window.location.reload();
                    }
                )
                .on(
                    'broadcast',
                    { event: 'match_log_insert' },
                    (payload) => {
                        if (payload.payload) {
                            setLogs((prev) => [...prev, payload.payload as MatchLog]);
                        }
                    }
                )
                .on(
                    'postgres_changes',
                    {
                        event: 'INSERT',
                        schema: 'public',
                        table: 'match_logs',
                        filter: `match_id=eq.${matchId}`,
                    },
                    (payload) => {
                        // Keep postgres_changes as fallback, but avoid duplicates
                        setLogs((prev) => {
                            if (prev.some(log => log.id === payload.new.id)) return prev;
                            return [...prev, payload.new as MatchLog];
                        });
                    }
                )
                .subscribe((status: string) => {
                    setIsConnected(status === 'SUBSCRIBED');
                });
        };

        setupSubscription();

        return () => {
            if (channel) {
                supabase.removeChannel(channel);
            }
        };
    }, [matchId, supabase, fetchData]);

    // Perform veto action
    const performAction = useCallback(
        async (
            action: 'ban' | 'pick' | 'side',
            mapId?: string,
            sideChoice?: SideChoice
        ): Promise<boolean> => {
            try {
                const response = await fetch('/api/veto/action', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        match_id: matchId,
                        token,
                        action,
                        map_id: mapId,
                        side_choice: sideChoice,
                    }),
                });

                const data = await response.json();

                if (!response.ok) {
                    setError(data.error || 'Action failed');
                    return false;
                }

                // Optimistically update state (realtime will confirm)
                if (data.new_state) {
                    setState(data.new_state);
                }

                return true;
            } catch (err) {
                setError('Network error');
                return false;
            }
        },
        [matchId, token]
    );

    // Perform coin toss (admin only - uses cookie auth)
    const performCoinToss = useCallback(async (forcedWinner?: VetoActor): Promise<VetoActor | null> => {
        try {
            const response = await fetch('/api/veto/coin-toss', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include', // Include cookies for admin auth
                body: JSON.stringify({
                    match_id: matchId,
                    forced_winner: forcedWinner,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                setError(data.error || 'Coin toss failed');
                return null;
            }

            return data.winner as VetoActor;
        } catch (err) {
            setError('Network error');
            return null;
        }
    }, [matchId]);

    // Perform ready check
    const performReady = useCallback(async (): Promise<boolean> => {
        try {
            const response = await fetch('/api/veto/ready', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    match_id: matchId,
                    token,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                setError(data.error || 'Check-in failed');
                return false;
            }

            if (data.new_state) {
                setState(data.new_state);
            }

            return true;
        } catch (err) {
            setError('Network error');
            return false;
        }
    }, [matchId, token]);

    // Manual refresh
    const refresh = useCallback(async () => {
        setIsLoading(true);
        await fetchData();
    }, [fetchData]);

    const value: RealtimeContextValue = {
        match,
        state,
        maps,
        logs,
        eventBranding,
        userRole,
        isConnected,
        isLoading,
        error,
        performAction,
        performCoinToss,
        performReady,
        refresh,
    };

    return (
        <RealtimeContext.Provider value={value}>
            {children}
        </RealtimeContext.Provider>
    );
}

export function useRealtime() {
    const context = useContext(RealtimeContext);
    if (!context) {
        throw new Error('useRealtime must be used within a RealtimeProvider');
    }
    return context;
}

// Convenience hooks
export function useMatchData() {
    const { match, state, maps, logs, eventBranding, isLoading, error, userRole } = useRealtime();
    return { match, state, maps, logs, eventBranding, isLoading, error, userRole };
}

export function useVetoActions() {
    const { performAction, performCoinToss, performReady, error } = useRealtime();
    const [isSubmitting, setIsSubmitting] = useState(false);

    const banMap = useCallback(
        async (mapId: string) => {
            setIsSubmitting(true);
            const result = await performAction('ban', mapId);
            setIsSubmitting(false);
            return result;
        },
        [performAction]
    );

    const pickMap = useCallback(
        async (mapId: string) => {
            setIsSubmitting(true);
            const result = await performAction('pick', mapId);
            setIsSubmitting(false);
            return result;
        },
        [performAction]
    );

    const pickSide = useCallback(
        async (side: SideChoice) => {
            setIsSubmitting(true);
            const result = await performAction('side', undefined, side);
            setIsSubmitting(false);
            return result;
        },
        [performAction]
    );

    const coinToss = useCallback(async (forcedWinner?: VetoActor) => {
        setIsSubmitting(true);
        const result = await performCoinToss(forcedWinner);
        setIsSubmitting(false);
        return result;
    }, [performCoinToss]);

    const readyUp = useCallback(async () => {
        setIsSubmitting(true);
        const result = await performReady();
        setIsSubmitting(false);
        return result;
    }, [performReady]);

    return { banMap, pickMap, pickSide, coinToss, readyUp, isSubmitting, error };
}

export function useConnectionStatus() {
    const { isConnected, isLoading } = useRealtime();
    return { isConnected, isLoading };
}

export function useUserRole() {
    const { userRole } = useRealtime();
    return userRole;
}
