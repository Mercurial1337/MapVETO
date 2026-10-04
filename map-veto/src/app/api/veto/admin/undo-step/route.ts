import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { z } from 'zod';

const ActionSchema = z.object({
    match_id: z.string().uuid(),
    token: z.string().uuid(),
});

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const validationResult = ActionSchema.safeParse(body);
        if (!validationResult.success) {
            return NextResponse.json({ error: validationResult.error.issues[0].message }, { status: 400 });
        }

        const { match_id, token } = validationResult.data;
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

        // Broadcast to clients to reload the page! 
        // Real rollback is very complex in SQL. It is safer to trigger a full recalculation. 
        // For now, since rollback requires unwinding state, we'll return an error if it's too complex, or implement it by resetting and replaying.
        
        // As a fallback, we tell the user that undoing is not fully supported yet without full state replay.
        return NextResponse.json({ error: 'Undo step is currently under development. Use Restart Veto instead.' }, { status: 501 });

    } catch (error) {
        console.error('Undo veto error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
