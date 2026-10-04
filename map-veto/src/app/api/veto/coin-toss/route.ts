import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { matchAdminToken } from '@/lib/auth/matchAdmin';
import { vetoResponse } from '@/lib/veto/respond';
import { z } from 'zod';
const schema = z.object({ match_id: z.string().uuid(), token: z.string().uuid().optional(), forced_winner: z.enum(['team_a','team_b']).optional() });
export async function POST(request: NextRequest) {
    const input = schema.safeParse(await request.json().catch(() => null));
    if (!input.success) return NextResponse.json({ error: 'Invalid coin toss request' }, { status: 400 });
    const { match_id, token, forced_winner } = input.data;
    const admin = await matchAdminToken(match_id, token);
    if (forced_winner && !admin) return NextResponse.json({ error: 'Match administrator required' }, { status: 403 });
    if (!token && !admin) return NextResponse.json({ error: 'Valid link required' }, { status: 401 });
    const { data, error } = await createServiceClient().rpc('veto_coin', { p_match_id: match_id, p_token: admin || token, p_forced: forced_winner || null });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return vetoResponse(match_id, data);
}
