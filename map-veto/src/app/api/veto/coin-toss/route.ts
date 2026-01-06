import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient, createClient } from '@/lib/supabase/server';
import { z } from 'zod';
import type { VetoActor } from '@/types';

const CoinTossSchema = z.object({
    match_id: z.string().uuid(),
});

export async function POST(request: NextRequest) {
    try {
        // Check if user is authenticated (admin only)
        const userClient = await createClient();
        const { data: { user } } = await userClient.auth.getUser();

        if (!user) {
            return NextResponse.json(
                { error: 'Admin authentication required to perform coin toss' },
                { status: 401 }
            );
        }

        const body = await request.json();

        const validationResult = CoinTossSchema.safeParse(body);
        if (!validationResult.success) {
            return NextResponse.json(
                { error: validationResult.error.issues[0].message },
                { status: 400 }
            );
        }

        const { match_id } = validationResult.data;
        const supabase = createServiceClient();

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

        if (matchData.status !== 'coin_toss') {
            return NextResponse.json(
                { error: 'Coin toss already completed or match not ready' },
                { status: 400 }
            );
        }

        // Perform coin toss (cryptographically random)
        const randomBytes = new Uint8Array(1);
        crypto.getRandomValues(randomBytes);
        const winner: VetoActor = randomBytes[0] % 2 === 0 ? 'team_a' : 'team_b';

        // Update match
        const { error: updateError } = await supabase
            .from('matches')
            .update({
                coin_toss_winner: winner,
                status: 'in_progress',
                started_at: new Date().toISOString(),
            })
            .eq('id', match_id);

        if (updateError) {
            return NextResponse.json(
                { error: 'Failed to update match' },
                { status: 500 }
            );
        }

        // Log the coin toss
        await supabase.from('match_logs').insert({
            match_id,
            step_number: -1, // Pre-veto step
            action_type: 'coin_toss',
            actor: winner,
        });

        return NextResponse.json({
            success: true,
            winner,
        });
    } catch (error) {
        console.error('Coin toss error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
