import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { z } from 'zod';

const ReadyActionSchema = z.object({
    match_id: z.string().uuid(),
    token: z.string().uuid(),
});

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        const validationResult = ReadyActionSchema.safeParse(body);
        if (!validationResult.success) {
            return NextResponse.json(
                { error: validationResult.error.issues[0].message },
                { status: 400 }
            );
        }

        const { match_id, token } = validationResult.data;
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
                { error: 'Observers cannot check in' },
                { status: 403 }
            );
        }

        const actingTeam = linkData.link_type as 'team_a' | 'team_b';

        // Get match and verify status
        const { data: matchData, error: matchError } = await supabase
            .from('matches')
            .select('status')
            .eq('id', match_id)
            .single();

        if (matchError || !matchData) {
            return NextResponse.json(
                { error: 'Match not found' },
                { status: 404 }
            );
        }

        if (matchData.status !== 'ready_check') {
            return NextResponse.json(
                { error: 'Check-in is not available at this time' },
                { status: 400 }
            );
        }

        // Get current match state to check if both are ready
        const { data: matchState, error: stateError } = await supabase
            .from('match_state')
            .select('team_a_ready, team_b_ready')
            .eq('match_id', match_id)
            .single();

        if (stateError || !matchState) {
            return NextResponse.json(
                { error: 'Match state not found' },
                { status: 404 }
            );
        }

        // Check if already ready
        if (actingTeam === 'team_a' && matchState.team_a_ready) {
            return NextResponse.json({ success: true, already_ready: true });
        }
        if (actingTeam === 'team_b' && matchState.team_b_ready) {
            return NextResponse.json({ success: true, already_ready: true });
        }

        // Update match state
        const updateData: any = {
            updated_at: new Date().toISOString()
        };

        if (actingTeam === 'team_a') {
            updateData.team_a_ready = true;
            updateData.team_a_ready_at = new Date().toISOString();
        } else {
            updateData.team_b_ready = true;
            updateData.team_b_ready_at = new Date().toISOString();
        }

        const { data: updatedState, error: updateStateError } = await supabase
            .from('match_state')
            .update(updateData)
            .eq('match_id', match_id)
            .select()
            .single();

        if (updateStateError) {
            console.error('Update state error:', updateStateError);
            return NextResponse.json(
                { error: 'Failed to update check-in status' },
                { status: 500 }
            );
        }

        let matchStatusUpdate = null;

        // If both teams are now ready, advance match status to coin_toss
        if (updatedState.team_a_ready && updatedState.team_b_ready) {
            const { error: matchUpdateError } = await supabase
                .from('matches')
                .update({ status: 'coin_toss' })
                .eq('id', match_id);

            if (matchUpdateError) {
                console.error('Update match error:', matchUpdateError);
            } else {
                matchStatusUpdate = 'coin_toss';
            }
        }

        // Broadcast updates
        const channel = supabase.channel(`match:${match_id}`);
        
        await channel.send({
            type: 'broadcast',
            event: 'match_state_update',
            payload: updatedState
        });

        if (matchStatusUpdate) {
            await channel.send({
                type: 'broadcast',
                event: 'match_update',
                payload: { status: matchStatusUpdate }
            });
        }
        
        await supabase.removeChannel(channel);

        return NextResponse.json({
            success: true,
            new_state: updatedState,
            match_status_updated: !!matchStatusUpdate
        });
    } catch (error) {
        console.error('Ready action error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
