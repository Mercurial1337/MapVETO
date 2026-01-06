'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { MatchStatePayload, MatchState, VetoActor } from '@/types';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface UseMatchStateOptions {
    matchId: string;
    onStateChange?: (state: MatchStatePayload) => void;
}

interface UseMatchStateReturn {
    state: MatchState | null;
    isConnected: boolean;
    isLoading: boolean;
    error: string | null;
    refetch: () => Promise<void>;
}

export function useMatchState({ matchId, onStateChange }: UseMatchStateOptions): UseMatchStateReturn {
    const [state, setState] = useState<MatchState | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const supabase = createClient();

    const fetchState = useCallback(async () => {
        try {
            setIsLoading(true);
            const { data, error: fetchError } = await supabase
                .from('match_state')
                .select('*')
                .eq('match_id', matchId)
                .single();

            if (fetchError) {
                throw fetchError;
            }

            setState(data as MatchState);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch match state');
        } finally {
            setIsLoading(false);
        }
    }, [matchId, supabase]);

    useEffect(() => {
        let channel: RealtimeChannel | null = null;

        const setupSubscription = async () => {
            // Fetch initial state
            await fetchState();

            // Subscribe to realtime updates
            channel = supabase
                .channel(`match:${matchId}`)
                .on(
                    'postgres_changes',
                    {
                        event: 'UPDATE',
                        schema: 'public',
                        table: 'match_state',
                        filter: `match_id=eq.${matchId}`,
                    },
                    (payload) => {
                        const newState = payload.new as MatchStatePayload;
                        setState((prev) => ({
                            ...prev,
                            ...newState,
                        } as MatchState));
                        onStateChange?.(newState);
                    }
                )
                .subscribe((status) => {
                    setIsConnected(status === 'SUBSCRIBED');
                });
        };

        setupSubscription();

        return () => {
            if (channel) {
                supabase.removeChannel(channel);
            }
        };
    }, [matchId, fetchState, onStateChange, supabase]);

    return {
        state,
        isConnected,
        isLoading,
        error,
        refetch: fetchState,
    };
}

interface UseVetoActionsOptions {
    matchId: string;
    token: string;
}

interface UseVetoActionsReturn {
    banMap: (mapId: string) => Promise<boolean>;
    pickMap: (mapId: string) => Promise<boolean>;
    pickSide: (side: 'attack' | 'defense') => Promise<boolean>;
    isSubmitting: boolean;
    error: string | null;
}

export function useVetoActions({ matchId, token }: UseVetoActionsOptions): UseVetoActionsReturn {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const performAction = useCallback(
        async (action: 'ban' | 'pick' | 'side', mapId?: string, sideChoice?: 'attack' | 'defense') => {
            try {
                setIsSubmitting(true);
                setError(null);

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
                    throw new Error(data.error || 'Action failed');
                }

                return true;
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Action failed');
                return false;
            } finally {
                setIsSubmitting(false);
            }
        },
        [matchId, token]
    );

    const banMap = useCallback(
        (mapId: string) => performAction('ban', mapId),
        [performAction]
    );

    const pickMap = useCallback(
        (mapId: string) => performAction('pick', mapId),
        [performAction]
    );

    const pickSide = useCallback(
        (side: 'attack' | 'defense') => performAction('side', undefined, side),
        [performAction]
    );

    return {
        banMap,
        pickMap,
        pickSide,
        isSubmitting,
        error,
    };
}

interface UseTeamIdentityOptions {
    matchId: string;
    token: string;
}

interface TeamIdentityData {
    linkType: 'team_a' | 'team_b' | 'observer';
    teamName: string;
    teamLogo: string | null;
    opponentName: string;
    opponentLogo: string | null;
}

interface UseTeamIdentityReturn {
    identity: TeamIdentityData | null;
    isLoading: boolean;
    error: string | null;
    canInteract: boolean;
    isMyTurn: (currentTurn: VetoActor | null) => boolean;
}

export function useTeamIdentity({ matchId, token }: UseTeamIdentityOptions): UseTeamIdentityReturn {
    const [identity, setIdentity] = useState<TeamIdentityData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const supabase = createClient();

    useEffect(() => {
        const validateToken = async () => {
            try {
                setIsLoading(true);

                // Fetch link data to determine team
                const { data: linkData, error: linkError } = await supabase
                    .from('match_links')
                    .select('link_type')
                    .eq('match_id', matchId)
                    .eq('token', token)
                    .single();

                if (linkError || !linkData) {
                    throw new Error('Invalid or expired token');
                }

                // Fetch match data for team names
                const { data: matchData, error: matchError } = await supabase
                    .from('matches')
                    .select('team_a_name, team_a_logo, team_b_name, team_b_logo')
                    .eq('id', matchId)
                    .single();

                if (matchError || !matchData) {
                    throw new Error('Match not found');
                }

                const linkType = linkData.link_type as TeamIdentityData['linkType'];

                setIdentity({
                    linkType,
                    teamName: linkType === 'team_a' ? matchData.team_a_name :
                        linkType === 'team_b' ? matchData.team_b_name : 'Observer',
                    teamLogo: linkType === 'team_a' ? matchData.team_a_logo :
                        linkType === 'team_b' ? matchData.team_b_logo : null,
                    opponentName: linkType === 'team_a' ? matchData.team_b_name : matchData.team_a_name,
                    opponentLogo: linkType === 'team_a' ? matchData.team_b_logo : matchData.team_a_logo,
                });
                setError(null);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Authentication failed');
            } finally {
                setIsLoading(false);
            }
        };

        validateToken();
    }, [matchId, token, supabase]);

    const canInteract = identity?.linkType !== 'observer';

    const isMyTurn = useCallback(
        (currentTurn: VetoActor | null): boolean => {
            if (!identity || identity.linkType === 'observer') return false;
            return currentTurn === identity.linkType;
        },
        [identity]
    );

    return {
        identity,
        isLoading,
        error,
        canInteract,
        isMyTurn,
    };
}
