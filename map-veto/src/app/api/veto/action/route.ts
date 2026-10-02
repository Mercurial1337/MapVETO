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

        // 1. Call the atomic PostgreSQL RPC
        const { data: newState, error: rpcError } = await supabase.rpc('process_veto_action', {
            p_match_id: match_id,
            p_token: token,
            p_action: action,
            p_map_id: map_id || null,
            p_side_choice: side_choice || null,
        });

        if (rpcError) {
            console.error('RPC Error:', rpcError);
            // Distinguish between client errors (raised exceptions) and server errors
            const isClientError = rpcError.message && (
                rpcError.message.includes('Invalid') ||
                rpcError.message.includes('Observer') ||
                rpcError.message.includes('Not your turn') ||
                rpcError.message.includes('Expected action') ||
                rpcError.message.includes('not found') ||
                rpcError.message.includes('required') ||
                rpcError.message.includes('not available') ||
                rpcError.message.includes('completed') ||
                rpcError.message.includes('progress')
            );
            
            return NextResponse.json(
                { error: isClientError ? rpcError.message : 'Failed to process veto action' },
                { status: isClientError ? 400 : 500 }
            );
        }

        return NextResponse.json({
            success: true,
            new_state: newState,
        });
    } catch (error) {
        console.error('Veto action error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
