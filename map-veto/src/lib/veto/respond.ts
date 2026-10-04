import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export async function vetoResponse(matchId: string, result: { new_state: unknown; match: unknown }) {
    const supabase = createServiceClient();
    const channel = supabase.channel(`match:${matchId}`);
    try {
        await channel.send({ type: 'broadcast', event: 'match_state_update', payload: result.new_state });
        await channel.send({ type: 'broadcast', event: 'match_update', payload: result.match });
    } finally {
        await supabase.removeChannel(channel);
    }
    return NextResponse.json({ success: true, ...result });
}
