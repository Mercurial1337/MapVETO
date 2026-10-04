import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient, createClient } from '@/lib/supabase/server';
import { z } from 'zod';
import type { MatchState, VetoStep } from '@/types';

const ForceActionSchema = z.object({
    match_id: z.string().uuid(),
});

export async function POST(request: NextRequest) {
    try {
        const userClient = await createClient();
        const { data: { user } } = await userClient.auth.getUser();

        if (!user) {
            return NextResponse.json(
                { error: 'Admin authentication required' },
                { status: 401 }
            );
        }

        const body = await request.json();
        const validationResult = ForceActionSchema.safeParse(body);
        if (!validationResult.success) {
            return NextResponse.json(
                { error: validationResult.error.issues[0].message },
                { status: 400 }
            );
        }

        const { match_id } = validationResult.data;
        const supabase = createServiceClient();

        // 1. Get current match and state
        const { data: matchData, error: matchError } = await supabase
            .from('matches')
            .select(`
                status,
                custom_veto_sequence,
                veto_templates(sequence)
            `)
            .eq('id', match_id)
            .single();

        if (matchError || !matchData) {
            return NextResponse.json({ error: 'Match not found' }, { status: 404 });
        }

        if (matchData.status !== 'in_progress') {
            return NextResponse.json({ error: 'Match not in progress' }, { status: 400 });
        }

        const { data: stateData, error: stateError } = await supabase
            .from('match_state')
            .select('*')
            .eq('match_id', match_id)
            .single();

        if (stateError || !stateData) {
            return NextResponse.json({ error: 'State not found' }, { status: 404 });
        }

        const state = stateData as MatchState;

        if (state.is_complete) {
            return NextResponse.json({ error: 'Veto is complete' }, { status: 400 });
        }

        // 3. Determine action to take
        const sequence = matchData.custom_veto_sequence || (matchData.veto_templates as any)?.sequence;
        const currentStepDef = sequence?.steps?.[state.current_step] as VetoStep;

        if (!currentStepDef) {
            return NextResponse.json({ error: 'Invalid step' }, { status: 500 });
        }

        const action = currentStepDef.action;
        const currentTurn = state.current_turn;

        if (!currentTurn || currentTurn === 'system') {
            return NextResponse.json({ error: 'System turn cannot be forced' }, { status: 400 });
        }

        // Get token for the team whose turn it is
        const { data: linkData, error: linkError } = await supabase
            .from('match_links')
            .select('token')
            .eq('match_id', match_id)
            .eq('link_type', currentTurn)
            .single();

        if (linkError || !linkData) {
            return NextResponse.json({ error: 'Could not find team token' }, { status: 500 });
        }

        const token = linkData.token;

        let map_id = null;
        let side_choice = null;

        if (action === 'ban' || action === 'pick') {
            // Pick random available map
            const availableMaps = state.available_maps;
            if (!availableMaps || availableMaps.length === 0) {
                return NextResponse.json({ error: 'No maps available' }, { status: 500 });
            }
            const randomIndex = Math.floor(Math.random() * availableMaps.length);
            map_id = availableMaps[randomIndex];
        } else if (action === 'side') {
            // Pick random side
            side_choice = Math.random() < 0.5 ? 'attack' : 'defense';
        }

        // 4. Execute action via RPC
        const { data: newState, error: rpcError } = await supabase.rpc('process_veto_action', {
            p_match_id: match_id,
            p_token: token,
            p_action: action,
            p_map_id: map_id,
            p_side_choice: side_choice,
            p_is_auto: true,
        });

        if (rpcError) {
            console.error('RPC Error in force-action:', rpcError);
            return NextResponse.json({ error: 'Failed to process auto action' }, { status: 500 });
        }

        // Log admin override
        await supabase.from('match_logs').insert({
            match_id,
            step_number: state.current_step,
            action_type: 'admin_action',
            actor: 'admin',
            metadata: { action_details: `Admin forced a random ${action}` }
        });

        // 5. Broadcast updates
        const channel = supabase.channel(`match:${match_id}`);
        await channel.send({
            type: 'broadcast',
            event: 'match_state_update',
            payload: newState
        });

        if (newState.is_complete) {
            await channel.send({
                type: 'broadcast',
                event: 'match_update',
                payload: { status: 'completed' }
            });
        }
        
        // Broadcast the new log
        const { data: latestLog } = await supabase
            .from('match_logs')
            .select('*')
            .eq('match_id', match_id)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (latestLog) {
            await channel.send({
                type: 'broadcast',
                event: 'match_log_insert',
                payload: latestLog
            });
        }

        await supabase.removeChannel(channel);

        return NextResponse.json({
            success: true,
            new_state: newState,
            forced: true
        });

    } catch (error) {
        console.error('Force action error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
