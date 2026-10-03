import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: eventId } = await params;
        const supabase = createServiceClient();
        const { searchParams } = new URL(request.url);

        const limit = parseInt(searchParams.get('limit') || '10');
        const offset = parseInt(searchParams.get('offset') || '0');

        // Fetch event details
        const { data: event, error: eventError } = await supabase
            .from('events')
            .select('name, logo_url')
            .eq('id', eventId)
            .single();

        if (eventError || !event) {
            return NextResponse.json(
                { error: 'Event not found' },
                { status: 404 }
            );
        }

        // Fetch completed matches for this event
        const { data: matches, error: matchesError, count } = await supabase
            .from('matches')
            .select('id, team_a_name, team_b_name, format, created_at, scheduled_at', { count: 'exact' })
            .eq('event_id', eventId)
            .eq('status', 'completed')
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (matchesError) {
            return NextResponse.json(
                { error: 'Failed to fetch matches' },
                { status: 500 }
            );
        }

        return NextResponse.json({
            event,
            matches,
            pagination: {
                offset,
                limit,
                total: count || 0,
            },
        });
    } catch (error) {
        console.error('List completed matches error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
