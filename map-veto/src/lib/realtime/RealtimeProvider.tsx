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
import type { MatchState, Match, VetoActor, SideChoice, GameMap } from '@/types';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

type UserRole = 'team_a' | 'team_b' | 'observer' | null;

interface RealtimeContextValue {
    // Match data
    match: Match | null;
    state: MatchState | null;
    maps: GameMap[];

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
    performCoinToss: () => Promise<VetoActor | null>;

    // Refresh
    refresh: () => Promise<void>;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

interface RealtimeProviderProps {
    matchId: string;
    token: string;
    children: ReactNode;
}

export function RealtimeProvider({ matchId, token, children }: RealtimeProviderProps) {
    const [match, setMatch] = useState<Match | null>(null);
    const [state, setState] = useState<MatchState | null>(null);
    const [maps, setMaps] = useState<GameMap[]>([]);
    const [userRole, setUserRole] = useState<UserRole>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const supabase = createClient();

    // Fetch initial data and user role
    const fetchData = useCallback(async () => {
        try {
            // Fetch match and state
            const { data: matchData, error: matchError } = await supabase
                .from('matches')
                .select(`
          *,
          match_state(*),
          veto_templates(id, name, format, sequence, game_id)
        `)
                .eq('id', matchId)
                .single();

            if (matchError) {
                setError('Match not found');
                return;
            }

            setMatch(matchData);
            setState(matchData.match_state);

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

            // Fetch user role from token
            const { data: linkData } = await supabase
                .from('match_links')
                .select('link_type')
                .eq('token', token)
                .eq('match_id', matchId)
                .single();

            if (linkData) {
                setUserRole(linkData.link_type as UserRole);
            }

            setError(null);
        } catch (err) {
            setError('Failed to fetch match data');
        } finally {
            setIsLoading(false);
        }
    }, [matchId, token, supabase]);

    // Subscribe to realtime updates
    useEffect(() => {
        let channel: RealtimeChannel | null = null;

        const setupSubscription = async () => {
            await fetchData();

            // Subscribe to match_state changes
            channel = supabase
                .channel(`match:${matchId}`)
                .on(
                    'postgres_changes',
                    {
                        event: '*',
                        schema: 'public',
                        table: 'match_state',
                        filter: `match_id=eq.${matchId}`,
                    },
                    (payload: RealtimePostgresChangesPayload<MatchState>) => {
                        if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
                            setState(payload.new as MatchState);
                        }
                    }
                )
                .on(
                    'postgres_changes',
                    {
                        event: 'UPDATE',
                        schema: 'public',
                        table: 'matches',
                        filter: `id=eq.${matchId}`,
                    },
                    (payload: RealtimePostgresChangesPayload<Match>) => {
                        setMatch((prev) => (prev ? { ...prev, ...payload.new as Partial<Match> } : null));
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

    // Manual refresh
    const refresh = useCallback(async () => {
        setIsLoading(true);
        await fetchData();
    }, [fetchData]);

    const value: RealtimeContextValue = {
        match,
        state,
        maps,
        userRole,
        isConnected,
        isLoading,
        error,
        performAction,
        performCoinToss,
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
    const { match, state, maps, isLoading, error, userRole } = useRealtime();
    return { match, state, maps, isLoading, error, userRole };
}

export function useVetoActions() {
    const { performAction, performCoinToss, error } = useRealtime();
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

    const coinToss = useCallback(async () => {
        setIsSubmitting(true);
        const result = await performCoinToss();
        setIsSubmitting(false);
        return result;
    }, [performCoinToss]);

    return { banMap, pickMap, pickSide, coinToss, isSubmitting, error };
}

export function useConnectionStatus() {
    const { isConnected, isLoading } = useRealtime();
    return { isConnected, isLoading };
}

export function useUserRole() {
    const { userRole } = useRealtime();
    return userRole;
}
