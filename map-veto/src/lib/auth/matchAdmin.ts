import { createClient, createServiceClient } from '@/lib/supabase/server';
import { canAccessEvent } from '@/lib/auth/eventAuth';

// An authenticated account is not automatically an administrator of every match.
export async function matchAdminToken(matchId: string, token?: string): Promise<string | null> {
    const db = createServiceClient();
    if (token) {
        const { data: link } = await db.from('match_links').select('token, expires_at').eq('match_id', matchId).eq('token', token).eq('link_type', 'admin').single();
        if (link && (!link.expires_at || Date.parse(link.expires_at) > Date.now())) return link.token;
    }
    const { data: { user } } = await (await createClient()).auth.getUser();
    if (!user) return null;
    const { data: match } = await db.from('matches').select('created_by,event_id').eq('id', matchId).single();
    if (!match || (match.created_by !== user.id && (!match.event_id || !await canAccessEvent(user.id, match.event_id)))) return null;
    const { data: link } = await db.from('match_links').select('token,expires_at').eq('match_id', matchId).eq('link_type', 'admin').single();
    return link && (!link.expires_at || Date.parse(link.expires_at) > Date.now()) ? link.token : null;
}
