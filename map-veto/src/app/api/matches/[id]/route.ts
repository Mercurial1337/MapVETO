import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

interface RouteParams {
    params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
    try {
        const { id: matchId } = await params;
        const supabase = createServiceClient();

        // Get match with related data
        const { data: match, error } = await supabase
            .from('matches')
            .select(`
        *,
        match_state(*),
        veto_templates(id, name, format, sequence),
        tournaments(id, name)
      `)
            .eq('id', matchId)
            .single();

        if (error || !match) {
            return NextResponse.json(
                { error: 'Match not found' },
                { status: 404 }
            );
        }

        return NextResponse.json({ match });
    } catch (error) {
        console.error('Get match error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

// Get magic links for a match (admin only)
export async function POST(request: NextRequest, { params }: RouteParams) {
    try {
        const { id: matchId } = await params;
        const supabase = createServiceClient();

        // Verify match exists
        const { data: match, error: matchError } = await supabase
            .from('matches')
            .select('id, team_a_name, team_b_name')
            .eq('id', matchId)
            .single();

        if (matchError || !match) {
            return NextResponse.json(
                { error: 'Match not found' },
                { status: 404 }
            );
        }

        // Get links
        const { data: links, error: linksError } = await supabase
            .from('match_links')
            .select('link_type, token')
            .eq('match_id', matchId);

        if (linksError) {
            return NextResponse.json(
                { error: 'Failed to fetch links' },
                { status: 500 }
            );
        }

        // Format response
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
        const magicLinks: Record<string, { token: string; url: string; label: string }> = {};

        for (const link of links || []) {
            const label = link.link_type === 'team_a'
                ? match.team_a_name
                : link.link_type === 'team_b'
                    ? match.team_b_name
                    : 'Observer';

            magicLinks[link.link_type] = {
                token: link.token,
                url: `${baseUrl}/match/${matchId}?token=${link.token}`,
                label,
            };
        }

        return NextResponse.json({
            match_id: matchId,
            links: magicLinks,
        });
    } catch (error) {
        console.error('Get match links error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

// Update match status (start, reset, cancel)
export async function PATCH(request: NextRequest, { params }: RouteParams) {
    try {
        const { id: matchId } = await params;
        const body = await request.json();
        const supabase = createServiceClient();

        const { action } = body;

        if (!['start', 'reset', 'cancel'].includes(action)) {
            return NextResponse.json(
                { error: 'Invalid action. Use: start, reset, cancel' },
                { status: 400 }
            );
        }

        // Get current match
        const { data: match, error: matchError } = await supabase
            .from('matches')
            .select('*, veto_templates(sequence)')
            .eq('id', matchId)
            .single();

        if (matchError || !match) {
            return NextResponse.json(
                { error: 'Match not found' },
                { status: 404 }
            );
        }

        if (action === 'start') {
            if (match.status !== 'pending' && match.status !== 'coin_toss') {
                return NextResponse.json(
                    { error: 'Can only start pending or coin_toss matches' },
                    { status: 400 }
                );
            }

            await supabase
                .from('matches')
                .update({
                    status: 'in_progress',
                    started_at: new Date().toISOString(),
                })
                .eq('id', matchId);

        } else if (action === 'reset') {
            // Reset match state to initial
            const template = match.veto_templates?.sequence;

            // Get map pool
            const { data: poolMaps } = await supabase
                .from('pool_maps')
                .select('map_id')
                .eq('pool_id', (await supabase
                    .from('map_pools')
                    .select('id')
                    .eq('is_default', true)
                    .single()).data?.id)
                .order('display_order');

            const mapIds = poolMaps?.map(pm => pm.map_id) || [];

            await supabase
                .from('match_state')
                .update({
                    current_step: 0,
                    current_turn: template?.steps?.[0]?.actor || 'team_a',
                    available_maps: mapIds,
                    banned_maps: [],
                    picked_maps: [],
                    results: [],
                    is_complete: false,
                    updated_at: new Date().toISOString(),
                })
                .eq('match_id', matchId);

            await supabase
                .from('matches')
                .update({
                    status: 'coin_toss',
                    coin_toss_winner: null,
                    coin_toss_forced: false,
                    started_at: null,
                    completed_at: null,
                })
                .eq('id', matchId);

            // Clear logs
            await supabase
                .from('match_logs')
                .delete()
                .eq('match_id', matchId);

        } else if (action === 'cancel') {
            await supabase
                .from('matches')
                .update({ status: 'cancelled' })
                .eq('id', matchId);
        }

        return NextResponse.json({ success: true, action });
    } catch (error) {
        console.error('Update match error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

// Delete a match permanently
export async function DELETE(request: NextRequest, { params }: RouteParams) {
    try {
        const { id: matchId } = await params;
        const supabase = createServiceClient();

        // Verify match exists
        const { data: match, error: matchError } = await supabase
            .from('matches')
            .select('id')
            .eq('id', matchId)
            .single();

        if (matchError || !match) {
            return NextResponse.json(
                { error: 'Match not found' },
                { status: 404 }
            );
        }

        // Delete the match — related rows in match_state, match_links,
        // and match_logs are removed automatically via ON DELETE CASCADE
        const { error: deleteError } = await supabase
            .from('matches')
            .delete()
            .eq('id', matchId);

        if (deleteError) {
            console.error('Delete match error:', deleteError);
            return NextResponse.json(
                { error: `Failed to delete match: ${deleteError.message}` },
                { status: 500 }
            );
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Delete match error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
