import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient, createClient } from '@/lib/supabase/server';
import { z } from 'zod';

const ResetVetoSchema = z.object({
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
        const validationResult = ResetVetoSchema.safeParse(body);
        if (!validationResult.success) {
            return NextResponse.json(
                { error: validationResult.error.issues[0].message },
                { status: 400 }
            );
        }

        const { match_id } = validationResult.data;
        const supabase = createServiceClient();

        // Check if match exists
        const { data: matchData, error: matchError } = await supabase
            .from('matches')
            .select('status, tournament_id, veto_template_id')
            .eq('id', match_id)
            .single();

        if (matchError || !matchData) {
            return NextResponse.json({ error: 'Match not found' }, { status: 404 });
        }

        // Get map pool maps
        let poolId;
        if (matchData.tournament_id) {
            const { data: tData } = await supabase.from('tournaments').select('map_pool_id').eq('id', matchData.tournament_id).single();
            poolId = tData?.map_pool_id;
        }
        
        if (!poolId) {
            const { data: vtData } = await supabase.from('veto_templates').select('game_id').eq('id', matchData.veto_template_id).single();
            const { data: mpData } = await supabase.from('map_pools').select('id').eq('game_id', vtData?.game_id).eq('is_default', true).single();
            poolId = mpData?.id;
        }

        const { data: pmData } = await supabase.from('pool_maps').select('map_id').eq('pool_id', poolId).order('display_order');
        const availableMaps = pmData?.map(m => m.map_id) || [];

        // Reset match status to coin_toss or ready_check
        const { error: mUpdateError } = await supabase
            .from('matches')
            .update({ status: 'ready_check', coin_toss_winner: null, started_at: null, completed_at: null })
            .eq('id', match_id);

        if (mUpdateError) {
            return NextResponse.json({ error: 'Failed to reset match' }, { status: 500 });
        }

        // Reset match_state
        const { data: updatedState, error: stateError } = await supabase
            .from('match_state')
            .update({
                current_step: 0,
                current_turn: 'team_a',
                available_maps: availableMaps,
                banned_maps: [],
                picked_maps: [],
                results: [],
                is_complete: false,
                team_a_ready: false,
                team_b_ready: false,
                team_a_ready_at: null,
                team_b_ready_at: null,
                actor_mapping: null,
                updated_at: new Date().toISOString()
            })
            .eq('match_id', match_id)
            .select()
            .single();

        if (stateError) {
            return NextResponse.json({ error: 'Failed to reset state' }, { status: 500 });
        }

        // Delete logs for this match
        await supabase.from('match_logs').delete().eq('match_id', match_id);
        
        // Add log
        await supabase.from('match_logs').insert({
            match_id,
            step_number: -3,
            action_type: 'admin_action',
            actor: 'admin',
            metadata: { action_details: 'Admin reset the veto' }
        });

        // Broadcast
        const channel = supabase.channel(`match:${match_id}`);
        await channel.send({
            type: 'broadcast',
            event: 'match_update',
            payload: { status: 'ready_check', coin_toss_winner: null, started_at: null, completed_at: null }
        });
        await channel.send({
            type: 'broadcast',
            event: 'match_state_update',
            payload: updatedState
        });
        
        // We also need to clear logs on the frontend, let's send a special broadcast or we could just reload
        await channel.send({
            type: 'broadcast',
            event: 'admin_veto_reset',
            payload: {}
        });

        await supabase.removeChannel(channel);

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error('Reset error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
