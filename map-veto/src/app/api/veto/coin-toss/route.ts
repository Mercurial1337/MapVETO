import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient, createClient } from '@/lib/supabase/server';
import { z } from 'zod';
import type { VetoActor } from '@/types';

const CoinTossSchema = z.object({
    match_id: z.string().uuid(),
    forced_winner: z.enum(['team_a', 'team_b']).optional(),
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

        const { match_id, forced_winner } = validationResult.data;
        const supabase = createServiceClient();

        // Get match and verify status
        const { data: matchData, error: matchError } = await supabase
            .from('matches')
            .select('status, coin_toss_winner, format')
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

        // Use forced winner if provided, otherwise perform random coin toss
        let winner: VetoActor;
        if (forced_winner) {
            winner = forced_winner;
        } else {
            // Perform coin toss (cryptographically random)
            const randomBytes = new Uint8Array(1);
            crypto.getRandomValues(randomBytes);
            winner = randomBytes[0] % 2 === 0 ? 'team_a' : 'team_b';
        }

        // Special case for Bo5 with forced winner:
        // Upper bracket team is automatically Team A - skip position selection
        const isBo5WithForcedWinner = matchData.format === 'bo5' && forced_winner;

        if (isBo5WithForcedWinner) {
            // Forced winner becomes Team A automatically
            // Create actor mapping: forced winner = team_a role
            const otherTeam = forced_winner === 'team_a' ? 'team_b' : 'team_a';
            const actorMapping = {
                [forced_winner]: 'team_a',
                [otherTeam]: 'team_b',
            };

            // Update match to in_progress directly (skip position selection)
            const { error: updateError } = await supabase
                .from('matches')
                .update({
                    coin_toss_winner: winner,
                    coin_toss_forced: true,
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

            // Update match_state with actor mapping and starting turn (Team A = forced winner)
            await supabase
                .from('match_state')
                .update({
                    current_turn: forced_winner,
                    actor_mapping: actorMapping,
                })
                .eq('match_id', match_id);

            // Log the coin toss
            await supabase.from('match_logs').insert({
                match_id,
                step_number: -1,
                action_type: 'coin_toss',
                actor: winner,
            });

            return NextResponse.json({
                success: true,
                winner,
                auto_team_a: true, // Indicate that position was auto-assigned
            });
        }

        // Normal flow: go to side_selection where winner chooses position
        const { error: updateError } = await supabase
            .from('matches')
            .update({
                coin_toss_winner: winner,
                coin_toss_forced: !!forced_winner,
                status: 'side_selection',
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

