import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { z } from 'zod';
import { cookies } from 'next/headers';
import { verify } from 'jsonwebtoken';

const ActionSchema = z.object({
    match_id: z.string().uuid(),
});

export async function POST(request: NextRequest) {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('mapveto_admin_token');
        if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-for-dev';
        try {
            verify(token.value, JWT_SECRET);
        } catch (e) {
            return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
        }

        const body = await request.json();
        const validationResult = ActionSchema.safeParse(body);
        if (!validationResult.success) {
            return NextResponse.json({ error: validationResult.error.issues[0].message }, { status: 400 });
        }

        const { match_id } = validationResult.data;
        const supabase = createServiceClient();

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
