import { createServiceClient } from '@/lib/supabase/server';
import MatchClient from './MatchClient';
import { matchAdminToken } from '@/lib/auth/matchAdmin';

interface MatchPageProps {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ token?: string }>;
}

export default async function MatchPage({ params, searchParams }: MatchPageProps) {
    const p = await params;
    const s = await searchParams;
    const matchId = p.id;
    const token = s.token || '';

    // If no token or demo mode, let the client component handle the UI for it
    if (!token || token === 'demo-token') {
        return <MatchClient matchId={matchId} token={token} initialData={{ match: null, state: null, maps: [], logs: [], eventBranding: null, userRole: null }} />;
    }

    const supabase = createServiceClient();

    // 1. Fetch Match Data and Token Role in Parallel
    const [matchResponse, linkResponse] = await Promise.all([
        supabase
            .from('matches')
            .select(`
                *,
                match_state(*),
                veto_templates(id, name, format, sequence, game_id),
                events(logo_url, coin_image_url, custom_font_url, custom_font_name)
            `)
            .eq('id', matchId)
            .single(),
        supabase
            .from('match_links')
            .select('link_type,expires_at')
            .eq('token', token)
            .eq('match_id', matchId)
            .single()
    ]);

    const link=linkResponse.data;
    if(!link || (link.expires_at && Date.parse(link.expires_at)<=Date.now())) {
        return <div className="p-8" role="alert">Invalid or expired match link.</div>;
    }
    const matchData = matchResponse.data;
    const userRole = linkResponse.data?.link_type || null;

    let mapsData = [];
    if (matchData?.veto_templates?.game_id) {
        // Fetch maps
        const { data } = await supabase
            .from('maps')
            .select('*')
            .eq('game_id', matchData.veto_templates.game_id)
            .eq('is_active', true);
        if (data) {
            mapsData = data;
        }
    }

    let logsData = [];
    if (matchData) {
        const { data } = await supabase
            .from('match_logs')
            .select('*')
            .eq('match_id', matchId)
            .order('log_order', { ascending: true });
        if (data) {
            logsData = data;
        }
    }

    const initialData = {
        match: matchData ? { ...matchData, can_admin: !!await matchAdminToken(matchId, token) } : null,
        state: Array.isArray(matchData?.match_state) ? matchData.match_state[0] : (matchData?.match_state || null),
        maps: mapsData,
        logs: logsData,
        eventBranding: matchData?.events || null,
        userRole: userRole,
    };

    return <MatchClient matchId={matchId} token={token} initialData={initialData} />;
}
