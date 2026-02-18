import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

// CORS headers — allow any origin to fetch this data
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
};

// Handle CORS preflight
export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: corsHeaders });
}

/**
 * PUBLIC endpoint — no auth required.
 * 
 * GET /api/matches/public
 * 
 * Lists all matches so external consumers can discover match IDs,
 * then poll /api/matches/:id/public for veto data.
 * 
 * Query params:
 *   - status: filter by match status (e.g. "in_progress", "completed", "coin_toss")
 *   - event_id: filter by event
 *   - limit: max results (default 50)
 *   - offset: pagination offset (default 0)
 * 
 * Response shape:
 * {
 *   matches: [
 *     {
 *       id: "uuid",
 *       team_a: "Fnatic",
 *       team_b: "M8",
 *       format: "bo3",
 *       status: "completed",
 *       scheduled_at: "2026-02-18T20:00:00Z",
 *       created_at: "2026-02-18T19:30:00Z"
 *     }
 *   ],
 *   pagination: { offset, limit, count }
 * }
 */
export async function GET(request: NextRequest) {
    try {
        const supabase = createServiceClient();
        const { searchParams } = new URL(request.url);

        const status = searchParams.get('status');
        const eventId = searchParams.get('event_id');
        const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
        const offset = parseInt(searchParams.get('offset') || '0');

        let query = supabase
            .from('matches')
            .select(`
                id,
                team_a_name,
                team_b_name,
                format,
                status,
                scheduled_at,
                created_at
            `)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (status) {
            query = query.eq('status', status);
        }

        if (eventId) {
            query = query.eq('event_id', eventId);
        }

        const { data: matches, error } = await query;

        if (error) {
            console.error('Public matches list error:', error);
            return NextResponse.json(
                { error: 'Failed to fetch matches' },
                { status: 500, headers: corsHeaders }
            );
        }

        // Map to clean public shape
        const publicMatches = (matches || []).map((m: any) => ({
            id: m.id,
            team_a: m.team_a_name,
            team_b: m.team_b_name,
            format: m.format,
            status: m.status,
            scheduled_at: m.scheduled_at,
            created_at: m.created_at,
        }));

        return NextResponse.json({
            matches: publicMatches,
            pagination: {
                offset,
                limit,
                count: publicMatches.length,
            },
        }, { headers: corsHeaders });
    } catch (error) {
        console.error('Public matches list error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500, headers: corsHeaders }
        );
    }
}
