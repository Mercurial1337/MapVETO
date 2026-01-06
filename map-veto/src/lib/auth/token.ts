import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import type { VetoActor } from '@/types';

export interface TokenValidationResult {
    isValid: boolean;
    linkType: VetoActor | 'observer' | null;
    matchId: string | null;
    error?: string;
}

/**
 * Validates a magic link token and returns the associated link type
 */
export async function validateToken(
    matchId: string,
    token: string
): Promise<TokenValidationResult> {
    if (!token || !matchId) {
        return {
            isValid: false,
            linkType: null,
            matchId: null,
            error: 'Missing token or match ID',
        };
    }

    try {
        const supabase = createServiceClient();

        const { data: link, error } = await supabase
            .from('match_links')
            .select('link_type, match_id, expires_at')
            .eq('token', token)
            .eq('match_id', matchId)
            .single();

        if (error || !link) {
            return {
                isValid: false,
                linkType: null,
                matchId: null,
                error: 'Invalid or expired token',
            };
        }

        // Check expiration
        if (link.expires_at && new Date(link.expires_at) < new Date()) {
            return {
                isValid: false,
                linkType: null,
                matchId: null,
                error: 'Token has expired',
            };
        }

        return {
            isValid: true,
            linkType: link.link_type as VetoActor | 'observer',
            matchId: link.match_id,
        };
    } catch (error) {
        console.error('Token validation error:', error);
        return {
            isValid: false,
            linkType: null,
            matchId: null,
            error: 'Validation failed',
        };
    }
}

/**
 * Middleware to protect routes requiring team access
 */
export async function requireTeamAccess(
    request: NextRequest,
    matchId: string,
    token: string
): Promise<NextResponse | null> {
    const validation = await validateToken(matchId, token);

    if (!validation.isValid) {
        return NextResponse.json(
            { error: validation.error || 'Unauthorized' },
            { status: 401 }
        );
    }

    if (validation.linkType === 'observer') {
        return NextResponse.json(
            { error: 'Observers cannot perform this action' },
            { status: 403 }
        );
    }

    // Return null to indicate success (continue with handler)
    return null;
}

/**
 * Check if it's the requesting team's turn
 */
export async function validateTurn(
    matchId: string,
    token: string
): Promise<{ isMyTurn: boolean; currentActor: VetoActor | null; error?: string }> {
    const validation = await validateToken(matchId, token);

    if (!validation.isValid || !validation.linkType) {
        return { isMyTurn: false, currentActor: null, error: validation.error };
    }

    if (validation.linkType === 'observer') {
        return { isMyTurn: false, currentActor: null, error: 'Observers cannot take turns' };
    }

    try {
        const supabase = createServiceClient();

        const { data: state, error } = await supabase
            .from('match_state')
            .select('current_turn')
            .eq('match_id', matchId)
            .single();

        if (error || !state) {
            return { isMyTurn: false, currentActor: null, error: 'Match state not found' };
        }

        return {
            isMyTurn: state.current_turn === validation.linkType,
            currentActor: state.current_turn as VetoActor,
        };
    } catch (error) {
        return { isMyTurn: false, currentActor: null, error: 'Turn validation failed' };
    }
}

/**
 * Get team identity from token
 */
export async function getTeamIdentity(
    matchId: string,
    token: string
): Promise<{
    linkType: VetoActor | 'observer';
    teamName: string;
    opponentName: string;
    canInteract: boolean;
} | null> {
    const validation = await validateToken(matchId, token);

    if (!validation.isValid || !validation.linkType) {
        return null;
    }

    try {
        const supabase = createServiceClient();

        const { data: match, error } = await supabase
            .from('matches')
            .select('team_a_name, team_b_name')
            .eq('id', matchId)
            .single();

        if (error || !match) {
            return null;
        }

        const linkType = validation.linkType;
        let teamName: string;
        let opponentName: string;

        if (linkType === 'team_a') {
            teamName = match.team_a_name;
            opponentName = match.team_b_name;
        } else if (linkType === 'team_b') {
            teamName = match.team_b_name;
            opponentName = match.team_a_name;
        } else {
            teamName = 'Observer';
            opponentName = '';
        }

        return {
            linkType,
            teamName,
            opponentName,
            canInteract: linkType !== 'observer',
        };
    } catch (error) {
        return null;
    }
}
