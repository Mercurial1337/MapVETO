import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { z } from 'zod';

const ActionSchema = z.object({
    match_id: z.string().uuid(),
    is_paused: z.boolean(),
    token: z.string().uuid(),
});

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const validationResult = ActionSchema.safeParse(body);
        if (!validationResult.success) {
            return NextResponse.json({ error: validationResult.error.issues[0].message }, { status: 400 });
        }

        const { match_id, is_paused, token } = validationResult.data;
        const supabase = createServiceClient();

        // 1. Verify Admin Link Token
        const { data: linkData, error: linkError } = await supabase
            .from('match_links')
            .select('link_type')
            .eq('match_id', match_id)
            .eq('token', token)
            .single();

        if (linkError || linkData?.link_type !== 'admin') {
            return NextResponse.json({ error: 'Unauthorized: Admin link required' }, { status: 401 });
        }

        // 2. Update is_paused in match_state
        const { data: newState, error } = await supabase
            .from('match_state')
            .update({ is_paused, updated_at: new Date().toISOString() })
            .eq('match_id', match_id)
            .select()
            .single();

        if (error || !newState) {
            return NextResponse.json({ error: 'Failed to update match state' }, { status: 500 });
        }

        // 3. Log Admin Action
        const { data: logEntry } = await supabase
            .from('match_logs')
            .insert({
                match_id,
                step_number: newState.current_step,
                action_type: 'admin_action',
                actor: 'admin',
                metadata: { action_details: is_paused ? 'Paused the veto' : 'Resumed the veto' }
            })
            .select()
            .single();

        // 4. Broadcast
        const channel = supabase.channel(`match:${match_id}`);
        await channel.send({
            type: 'broadcast',
            event: 'match_state_update',
            payload: newState
        });

        if (logEntry) {
            await channel.send({
                type: 'broadcast',
                event: 'match_log_insert',
                payload: logEntry
            });
        }
        
        await supabase.removeChannel(channel);

        return NextResponse.json({ success: true, new_state: newState });
    } catch (error) {
        console.error('Pause veto error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
