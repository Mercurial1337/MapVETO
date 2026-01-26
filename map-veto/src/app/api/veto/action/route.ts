import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { z } from 'zod';
import type { MatchState, VetoStep, VetoSequence, VetoActor } from '@/types';

// Request validation schema
const VetoActionSchema = z.object({
    match_id: z.string().uuid(),
    token: z.string().uuid(),
    action: z.enum(['ban', 'pick', 'side']),
    map_id: z.string().uuid().optional(),
    side_choice: z.enum(['attack', 'defense']).optional(),
}).refine((data) => {
    if (['ban', 'pick'].includes(data.action)) {
        return !!data.map_id;
    }
    if (data.action === 'side') {
        return !!data.side_choice;
    }
    return true;
}, {
    message: 'Invalid action payload: map_id required for ban/pick, side_choice required for side',
});

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        // Validate request body
        const validationResult = VetoActionSchema.safeParse(body);
        if (!validationResult.success) {
            return NextResponse.json(
                { error: validationResult.error.issues[0].message },
                { status: 400 }
            );
        }

        const { match_id, token, action, map_id, side_choice } = validationResult.data;
        const supabase = createServiceClient();

        // 1. Validate the token and get team identity
        const { data: linkData, error: linkError } = await supabase
            .from('match_links')
            .select('link_type, match_id')
            .eq('token', token)
            .eq('match_id', match_id)
            .single();

        if (linkError || !linkData) {
            return NextResponse.json(
                { error: 'Invalid or expired token' },
                { status: 401 }
            );
        }

        // Observer cannot perform actions
        if (linkData.link_type === 'observer') {
            return NextResponse.json(
                { error: 'Observers cannot perform actions' },
                { status: 403 }
            );
        }

        const actingTeam = linkData.link_type as VetoActor;

        // 2. Get current match state and template
        const { data: matchData, error: matchError } = await supabase
            .from('matches')
            .select(`
        *,
        match_state(*),
        veto_templates(sequence)
      `)
            .eq('id', match_id)
            .single();

        if (matchError || !matchData) {
            return NextResponse.json(
                { error: 'Match not found' },
                { status: 404 }
            );
        }

        if (matchData.status !== 'in_progress') {
            return NextResponse.json(
                { error: 'Match not in progress' },
                { status: 400 }
            );
        }

        const state = matchData.match_state as MatchState;
        const template = matchData.veto_templates.sequence as VetoSequence;
        const currentStepDef = template.steps[state.current_step] as VetoStep;

        if (!currentStepDef) {
            return NextResponse.json(
                { error: 'Veto sequence completed' },
                { status: 400 }
            );
        }

        // 3. Validate it's this team's turn
        // Use current_turn from state (set by position choice) instead of template's actor
        if (state.current_turn !== actingTeam) {
            return NextResponse.json(
                { error: `Not your turn. Current turn: ${state.current_turn}` },
                { status: 403 }
            );
        }

        // 4. Validate action matches expected step
        if (currentStepDef.action !== action) {
            return NextResponse.json(
                { error: `Expected action: ${currentStepDef.action}` },
                { status: 400 }
            );
        }

        // 5. Validate map is available (for ban/pick)
        if (['ban', 'pick'].includes(action) && map_id) {
            if (!state.available_maps.includes(map_id)) {
                return NextResponse.json(
                    { error: 'Map not available' },
                    { status: 400 }
                );
            }
        }

        // 6. Process the action
        const newState: Partial<MatchState> = {
            available_maps: [...state.available_maps],
            banned_maps: [...state.banned_maps],
            picked_maps: [...state.picked_maps],
            results: [...state.results],
        };

        switch (action) {
            case 'ban':
                newState.available_maps = state.available_maps.filter(
                    (id: string) => id !== map_id
                );
                newState.banned_maps = [
                    ...state.banned_maps,
                    { map_id: map_id!, banned_by: actingTeam },
                ];
                break;

            case 'pick':
                newState.available_maps = state.available_maps.filter(
                    (id: string) => id !== map_id
                );
                const newPickedMap = {
                    map_id: map_id!,
                    picked_by: actingTeam,
                    side: null,
                    map_number: currentStepDef.map_number!,
                };
                newState.picked_maps = [...state.picked_maps, newPickedMap];
                break;

            case 'side':
                const mapIndex = state.picked_maps.findIndex(
                    (m) => m.map_number === currentStepDef.map_number
                );
                if (mapIndex === -1) {
                    return NextResponse.json(
                        { error: 'Map not found for side selection' },
                        { status: 400 }
                    );
                }
                newState.picked_maps = state.picked_maps.map((m, i) =>
                    i === mapIndex
                        ? { ...m, side: side_choice!, side_picked_by: actingTeam }
                        : m
                );
                break;
        }

        // 7. Advance to next step
        let nextStep = state.current_step + 1;
        let isComplete = nextStep >= template.steps.length;
        let nextStepDef = template.steps[nextStep];

        // Handle auto-decider step
        if (nextStepDef?.action === 'decider') {
            const deciderId = newState.available_maps![0];
            // Remove ONLY the decider map from available maps, leave others to be shown as "crossed out"
            newState.available_maps = newState.available_maps!.filter(id => id !== deciderId);

            const deciderMap = {
                map_id: deciderId,
                picked_by: 'system' as VetoActor,
                side: null,
                map_number: nextStepDef.map_number!,
            };
            newState.picked_maps = [...newState.picked_maps!, deciderMap];

            // Advance to side selection after decider
            nextStep = nextStep + 1;
            nextStepDef = template.steps[nextStep];
            isComplete = nextStep >= template.steps.length;
        }

        // Determine next turn using actor_mapping
        // Template says next step is for "team_a" or "team_b" - we need to find which real team maps to that role
        let currentTurn: VetoActor | null = null;
        if (!isComplete && nextStepDef?.actor && nextStepDef.actor !== 'system') {
            const templateActor = nextStepDef.actor as 'team_a' | 'team_b';
            // Find which real team is mapped to this template role
            if (state.actor_mapping) {
                // Reverse lookup: find the key (real team) that has value = templateActor
                currentTurn = (Object.entries(state.actor_mapping).find(
                    ([, role]) => role === templateActor
                )?.[0] as VetoActor) || templateActor;
            } else {
                // Fallback: no mapping, use template directly
                currentTurn = templateActor;
            }
        }

        // Build final results if complete
        if (isComplete) {
            newState.results = newState.picked_maps!.sort((a, b) => a.map_number - b.map_number);
        }

        // 8. Update state in database
        const { error: updateError } = await supabase
            .from('match_state')
            .update({
                ...newState,
                current_step: nextStep,
                current_turn: currentTurn,
                is_complete: isComplete,
                updated_at: new Date().toISOString(),
            })
            .eq('match_id', match_id);

        if (updateError) {
            console.error('Update error:', updateError);
            return NextResponse.json(
                { error: 'Failed to update state' },
                { status: 500 }
            );
        }

        // Update match status if complete
        if (isComplete) {
            await supabase
                .from('matches')
                .update({
                    status: 'completed',
                    completed_at: new Date().toISOString(),
                })
                .eq('id', match_id);
        }

        // 9. Log the action
        await supabase.from('match_logs').insert({
            match_id,
            step_number: state.current_step,
            action_type: action,
            actor: actingTeam,
            map_id: map_id || null,
            side_choice: side_choice || null,
        });

        return NextResponse.json({
            success: true,
            new_state: {
                ...state,
                ...newState,
                current_step: nextStep,
                current_turn: currentTurn,
                is_complete: isComplete,
            },
        });
    } catch (error) {
        console.error('Veto action error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
