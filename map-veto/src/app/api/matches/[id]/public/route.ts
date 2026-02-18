import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

interface RouteParams {
    params: Promise<{ id: string }>;
}

// CORS headers — allow any origin to fetch this data
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
};

// Handle CORS preflight
export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: corsHeaders });
}

/**
 * PUBLIC endpoint — no auth required.
 * 
 * GET /api/matches/:id/public
 * 
 * Returns a simplified action-log style response for external graphics/overlays.
 * Consumers can poll this endpoint to get live data.
 * 
 * Response shape:
 * {
 *   best_of: 3,
 *   is_complete: false,
 *   actions: [
 *     { action: 1, type: "ban_map", team: "Fnatic", map: "Abyss" },
 *     { action: 2, type: "ban_map", team: "M8", map: "Bind" },
 *     { action: 3, type: "pick_map", team: "Fnatic", map: "Haven", map_number: 1 },
 *     { action: 4, type: "pick_side", team: "M8", map: "Haven", map_number: 1, side: "attack" },
 *     { action: 5, type: "pick_map", team: "M8", map: "Pearl", map_number: 2 },
 *     { action: 6, type: "pick_side", team: "Fnatic", map: "Pearl", map_number: 2, side: "defense" },
 *     { action: 7, type: "ban_map", team: "Fnatic", map: "Corrode" },
 *     { action: 8, type: "ban_map", team: "M8", map: "Split" },
 *     { action: 9, type: "decider", team: null, map: "Breeze", map_number: 3 },
 *     { action: 10, type: "pick_side", team: "Fnatic", map: "Breeze", map_number: 3, side: "attack" }
 *   ]
 * }
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
    try {
        const { id: matchId } = await params;
        const supabase = createServiceClient();

        // Fetch match with all related data
        const { data: match, error: matchError } = await supabase
            .from('matches')
            .select(`
                id, format, status,
                team_a_name, team_a_logo,
                team_b_name, team_b_logo,
                coin_toss_winner, coin_toss_forced,
                scheduled_at, started_at, completed_at, created_at,
                match_state(
                    current_step, current_turn,
                    available_maps, banned_maps, picked_maps, results,
                    is_complete, updated_at, actor_mapping
                ),
                veto_templates(id, name, format, sequence, game_id),
                events(id, name, logo_url)
            `)
            .eq('id', matchId)
            .single();

        if (matchError || !match) {
            return NextResponse.json(
                { error: 'Match not found' },
                { status: 404, headers: corsHeaders }
            );
        }

        // Fetch all maps for this game so we can resolve names
        let mapsLookup: Record<string, { name: string }> = {};

        if ((match as any).veto_templates?.game_id) {
            const { data: mapsData } = await supabase
                .from('maps')
                .select('id, name')
                .eq('game_id', (match as any).veto_templates.game_id)
                .eq('is_active', true);

            if (mapsData) {
                for (const m of mapsData) {
                    mapsLookup[m.id] = { name: m.name };
                }
            }
        }

        const state = (match as any).match_state;
        const template = (match as any).veto_templates;

        // Helper to resolve actor to team name
        const resolveActor = (actor: string) => {
            if (actor === 'team_a') return match.team_a_name;
            if (actor === 'team_b') return match.team_b_name;
            return actor;
        };

        // Helper to resolve map name
        const resolveMapName = (mapId: string) => mapsLookup[mapId]?.name || 'Unknown';

        // Derive best_of from format (e.g. "bo3" -> 3, "bo5" -> 5, "bo1" -> 1)
        const bestOf = match.format
            ? parseInt(match.format.replace(/\D/g, ''), 10) || null
            : null;

        // Build structured action objects
        const actions: Record<string, any>[] = [];

        if (state && template?.sequence?.steps) {
            const vetoSteps = template.sequence.steps;
            const bannedMaps = state.banned_maps || [];
            const pickedMaps = state.picked_maps || [];
            const currentStep = state.current_step || 0;

            let banIndex = 0;
            let actionNumber = 1;

            for (let i = 0; i < vetoSteps.length && i < currentStep; i++) {
                const step = vetoSteps[i];

                if (step.action === 'ban') {
                    const ban = bannedMaps[banIndex];
                    if (ban) {
                        actions.push({
                            action: actionNumber++,
                            type: 'ban_map',
                            team: resolveActor(ban.banned_by),
                            map: resolveMapName(ban.map_id),
                        });
                        banIndex++;
                    }
                } else if (step.action === 'pick') {
                    const pick = pickedMaps.find((p: any) => p.map_number === step.map_number);
                    if (pick) {
                        actions.push({
                            action: actionNumber++,
                            type: 'pick_map',
                            team: resolveActor(pick.picked_by),
                            map: resolveMapName(pick.map_id),
                            map_number: pick.map_number,
                        });
                    }
                } else if (step.action === 'side') {
                    const pick = pickedMaps.find((p: any) => p.map_number === step.map_number);
                    if (pick && pick.side) {
                        actions.push({
                            action: actionNumber++,
                            type: 'pick_side',
                            team: resolveActor(pick.side_picked_by || step.actor),
                            map: resolveMapName(pick.map_id),
                            map_number: pick.map_number,
                            side: pick.side,
                        });
                    }
                } else if (step.action === 'decider') {
                    const decider = pickedMaps.find((p: any) => p.map_number === step.map_number);
                    if (decider) {
                        actions.push({
                            action: actionNumber++,
                            type: 'decider',
                            team: null,
                            map: resolveMapName(decider.map_id),
                            map_number: decider.map_number,
                        });
                    }
                }
            }
        }

        // Build the simplified response
        const response = {
            best_of: bestOf,
            is_complete: state?.is_complete || false,
            actions,
        };

        return NextResponse.json(response, { headers: corsHeaders });

        /* ──────────────────────────────────────────────────────────────
         * OLD DETAILED RESPONSE — kept for reference, may restore later
         * ──────────────────────────────────────────────────────────────
         *
         * const resolveMap = (mapId: string) => ({
         *     map_id: mapId,
         *     map_name: mapsLookup[mapId]?.name || 'Unknown',
         *     map_slug: mapsLookup[mapId]?.slug || 'unknown',
         *     map_image: mapsLookup[mapId]?.image_url || null,
         * });
         *
         * const response = {
         *     match: {
         *         id: match.id,
         *         format: match.format,
         *         status: match.status,
         *         team_a: {
         *             name: match.team_a_name,
         *             logo: match.team_a_logo,
         *         },
         *         team_b: {
         *             name: match.team_b_name,
         *             logo: match.team_b_logo,
         *         },
         *         coin_toss_winner: match.coin_toss_winner
         *             ? resolveActor(match.coin_toss_winner)
         *             : null,
         *         coin_toss_winner_role: match.coin_toss_winner || null,
         *         scheduled_at: match.scheduled_at,
         *         started_at: match.started_at,
         *         completed_at: match.completed_at,
         *         created_at: match.created_at,
         *     },
         *     veto: state ? {
         *         current_step: state.current_step,
         *         current_turn: state.current_turn,
         *         current_turn_team: state.current_turn
         *             ? resolveActor(state.current_turn)
         *             : null,
         *         is_complete: state.is_complete,
         *         actor_mapping: state.actor_mapping || null,
         *         template: template ? {
         *             name: template.name,
         *             format: template.format,
         *             steps: template.sequence?.steps || [],
         *         } : null,
         *         banned_maps: (state.banned_maps || []).map((ban: any) => ({
         *             ...resolveMap(ban.map_id),
         *             banned_by: ban.banned_by,
         *             banned_by_team: resolveActor(ban.banned_by),
         *         })),
         *         picked_maps: (state.picked_maps || []).map((pick: any) => ({
         *             ...resolveMap(pick.map_id),
         *             picked_by: pick.picked_by,
         *             picked_by_team: resolveActor(pick.picked_by),
         *             side: pick.side || null,
         *             side_picked_by: pick.side_picked_by || null,
         *             side_picked_by_team: pick.side_picked_by
         *                 ? resolveActor(pick.side_picked_by)
         *                 : null,
         *             map_number: pick.map_number,
         *         })),
         *         available_maps: (state.available_maps || []).map((mapId: string) =>
         *             resolveMap(mapId)
         *         ),
         *         results: (state.results || []).map((pick: any) => ({
         *             ...resolveMap(pick.map_id),
         *             picked_by: pick.picked_by,
         *             picked_by_team: resolveActor(pick.picked_by),
         *             side: pick.side || null,
         *             side_picked_by: pick.side_picked_by || null,
         *             side_picked_by_team: pick.side_picked_by
         *                 ? resolveActor(pick.side_picked_by)
         *                 : null,
         *             map_number: pick.map_number,
         *         })),
         *     } : null,
         *     event: event ? {
         *         name: event.name,
         *         logo_url: event.logo_url,
         *     } : null,
         *     updated_at: state?.updated_at || match.created_at,
         * };
         *
         * return NextResponse.json(response, { headers: corsHeaders });
         * ──────────────────────────────────────────────────────────────
         */
    } catch (error) {
        console.error('Public match API error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500, headers: corsHeaders }
        );
    }
}
