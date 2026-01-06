import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { z } from 'zod';
import type { VetoActor } from '@/types';

const PositionChoiceSchema = z.object({
    match_id: z.string().uuid(),
    token: z.string().uuid(),
    pick_first: z.boolean(), // true = wants to pick first, false = wants to pick second
});

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        const validationResult = PositionChoiceSchema.safeParse(body);
        if (!validationResult.success) {
            return NextResponse.json(
                { error: validationResult.error.issues[0].message },
                { status: 400 }
            );
        }

        const { match_id, token, pick_first } = validationResult.data;
        const supabase = createServiceClient();

        // Validate token and get team identity
        const { data: linkData, error: linkError } = await supabase
            .from('match_links')
            .select('link_type')
            .eq('token', token)
            .eq('match_id', match_id)
            .single();

        if (linkError || !linkData) {
            return NextResponse.json(
                { error: 'Invalid or expired token' },
                { status: 401 }
            );
        }

        if (linkData.link_type === 'observer') {
            return NextResponse.json(
                { error: 'Observers cannot make position choices' },
                { status: 403 }
            );
        }

        const actingTeam = linkData.link_type as 'team_a' | 'team_b';

        // Get match and verify status
        const { data: matchData, error: matchError } = await supabase
            .from('matches')
            .select('status, coin_toss_winner')
            .eq('id', match_id)
            .single();

        if (matchError || !matchData) {
            return NextResponse.json(
                { error: 'Match not found' },
                { status: 404 }
            );
        }

        if (matchData.status !== 'side_selection') {
            return NextResponse.json(
                { error: 'Position selection not available at this time' },
                { status: 400 }
            );
        }

        // Verify this team won the coin toss
        if (matchData.coin_toss_winner !== actingTeam) {
            return NextResponse.json(
                { error: 'Only the coin toss winner can choose position' },
                { status: 403 }
            );
        }

        // Determine who goes first based on choice
        // If winner picks first, they are first_picker
        // If winner picks second, the other team is first_picker
        const firstPicker = pick_first ? actingTeam : (actingTeam === 'team_a' ? 'team_b' : 'team_a');

        // Update match status to in_progress
        const { error: updateError } = await supabase
            .from('matches')
            .update({
                status: 'in_progress',
                started_at: new Date().toISOString(),
            })
            .eq('id', match_id);

        if (updateError) {
            console.error('Update error:', updateError);
            return NextResponse.json(
                { error: 'Failed to update match' },
                { status: 500 }
            );
        }

        // Update match_state to set the correct starting turn
        await supabase
            .from('match_state')
            .update({
                current_turn: firstPicker,
            })
            .eq('match_id', match_id);

        // Log the position choice
        await supabase.from('match_logs').insert({
            match_id,
            step_number: -1,
            action_type: 'position_choice',
            actor: actingTeam,
            metadata: { pick_first, first_picker: firstPicker },
        });

        return NextResponse.json({
            success: true,
            first_picker: firstPicker,
        });
    } catch (error) {
        console.error('Position choice error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
