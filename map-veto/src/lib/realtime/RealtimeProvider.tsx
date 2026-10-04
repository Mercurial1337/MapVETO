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
import { matchNotices, timeoutNotice } from '@/lib/veto/notifications';

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

    const fetchData = useCallback(async () => {
        try {
            const response=await fetch('/api/veto/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({match_id:matchId,token})});
            const data=await response.json();
            if(!response.ok) {setError(data.error || 'Could not load match');return;}
            setMatch(prev=>({...prev,...data.match}));
            setState(data.state);setLogs(data.logs);setUserRole(data.userRole);setEventBranding(data.eventBranding);
            setError(null);
        } catch { setError('Connection lost. Retrying…'); }
        finally {setIsLoading(false);}
    },[matchId,token]);

    const prevMatchRef = useRef<Match | null>(initialData.match);
    const prevStateRef = useRef<MatchState | null>(initialData.state);

    const seenLogs = useRef(new Set(initialData.logs.map(log=>log.id)));
    useEffect(() => {
        const notices=matchNotices({match:prevMatchRef.current,state:prevStateRef.current},{match,state},userRole);
        for(const notice of notices) toast[notice.kind](notice.message);
        prevMatchRef.current=match;prevStateRef.current=state;
    },[match,state,userRole]);
    useEffect(()=>{
        if(!match) return;
        for(const log of logs) {
            if(seenLogs.current.has(log.id)) continue;
            seenLogs.current.add(log.id);
            const notice=timeoutNotice(log,match);
            if(notice) toast[notice.kind](notice.message);
        }
    },[logs,match]);

    // Read the authoritative snapshot after changes. Coalesce a transaction's
    // broadcasts into one request and recover missed events on reconnect/focus.
    useEffect(() => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const schedule=()=>{
            if(timer) return;
            timer=setTimeout(()=>{timer=undefined;void fetchData();},100);
        };
        const channel=supabase.channel(`match:${matchId}`)
            .on('broadcast',{event:'match_state_update'},schedule)
            .on('broadcast',{event:'match_update'},schedule)
            .on('broadcast',{event:'match_log_insert'},schedule)
            .on('postgres_changes',{event:'UPDATE',schema:'public',table:'match_state',filter:`match_id=eq.${matchId}`},schedule)
            .on('postgres_changes',{event:'UPDATE',schema:'public',table:'matches',filter:`id=eq.${matchId}`},schedule)
            .on('postgres_changes',{event:'INSERT',schema:'public',table:'match_logs',filter:`match_id=eq.${matchId}`},schedule)
            .subscribe(status=>{setIsConnected(status==='SUBSCRIBED');if(status==='SUBSCRIBED')schedule();});
        const recover=()=>{if(document.visibilityState==='visible')schedule();};
        const interval=setInterval(recover,15000);
        window.addEventListener('focus',recover);document.addEventListener('visibilitychange',recover);
        return ()=>{clearTimeout(timer);clearInterval(interval);window.removeEventListener('focus',recover);document.removeEventListener('visibilitychange',recover);void supabase.removeChannel(channel);};
    },[matchId,supabase,fetchData]);

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
                    token,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                setError(data.error || 'Coin toss failed');
                return null;
            }

            if (data.match) setMatch(prev => prev ? { ...prev, ...data.match } : data.match);
            if (data.new_state) setState(data.new_state);
            return data.match?.coin_toss_winner as VetoActor;
        } catch (err) {
            setError('Network error');
            return null;
        }
    }, [matchId, token]);

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

            if (data.match) setMatch(prev => prev ? { ...prev, ...data.match } : data.match);

            if (data.match) setMatch(prev => prev ? { ...prev, ...data.match } : data.match);
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
