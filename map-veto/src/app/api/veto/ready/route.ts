import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { vetoResponse } from '@/lib/veto/respond';
import { z } from 'zod';
const schema = z.object({ match_id: z.string().uuid(), token: z.string().uuid() });
export async function POST(request: NextRequest) {
    const input = schema.safeParse(await request.json().catch(() => null));
    if (!input.success) return NextResponse.json({ error: 'Invalid check-in request' }, { status: 400 });
    const { match_id, token } = input.data;
    const { data, error } = await createServiceClient().rpc('veto_ready', { p_match_id: match_id, p_token: token });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return vetoResponse(match_id, data);
}
