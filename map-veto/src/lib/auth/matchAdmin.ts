import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getEventRole } from '@/lib/auth/eventAuth';

// An authenticated account is not automatically an administrator of every match.
export async function matchStaffAccess(matchId: string, token?: string): Promise<{role:'admin'|'referee';token:string}|null> {
    const db = createServiceClient();
    if (token) {
        const { data: link } = await db.from('match_links').select('token,link_type,expires_at').eq('match_id', matchId).eq('token', token).single();
        if (link && ['admin','referee'].includes(link.link_type)) {
            if (link.expires_at && Date.parse(link.expires_at)<=Date.now()) return null;
            return {role:link.link_type as 'admin'|'referee',token:link.token};
        }
    }
    const { data: { user } } = await (await createClient()).auth.getUser();
    if (!user) return null;
    const { data: match } = await db.from('matches').select('created_by,event_id').eq('id', matchId).single();
    if (!match) return null;
    const membership=match.event_id?await getEventRole(user.id,match.event_id):null;
    const role=membership==='referee'?'referee':(membership || match.created_by===user.id)?'admin':null;
    if (!role) return null;
    const { data: link } = await db.from('match_links').select('token,expires_at').eq('match_id', matchId).eq('link_type', role).single();
    return link && (!link.expires_at || Date.parse(link.expires_at) > Date.now()) ? {role,token:link.token} : null;
}

export async function matchAdminToken(matchId: string, token?: string): Promise<string|null> {
    const access=await matchStaffAccess(matchId,token);
    return access?.role==='admin'?access.token:null;
}
