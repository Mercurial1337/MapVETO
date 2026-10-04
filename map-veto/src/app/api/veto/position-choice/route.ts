import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { vetoResponse } from '@/lib/veto/respond';
import { z } from 'zod';
const schema = z.object({ match_id: z.string().uuid(), token: z.string().uuid(), pick_first: z.boolean() });
export async function POST(request: NextRequest) {
    const input = schema.safeParse(await request.json().catch(() => null));
    if (!input.success) return NextResponse.json({ error: 'Invalid position choice' }, { status: 400 });
    const { match_id, token, pick_first } = input.data;
    const { data, error } = await createServiceClient().rpc('veto_position', { p_match_id: match_id, p_token: token, p_first: pick_first });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return vetoResponse(match_id, data);
}
