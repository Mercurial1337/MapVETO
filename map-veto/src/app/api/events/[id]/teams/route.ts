import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient, createClient } from '@/lib/supabase/server';
import { getEventRole } from '@/lib/auth/eventAuth';

interface RouteParams {
    params: Promise<{ id: string }>;
}

// GET: List all teams for an event
export async function GET(request: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params;
        const authClient = await createClient();
        const { data: { user } } = await authClient.auth.getUser();

        if (!user) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const role = await getEventRole(user.id, id);
        if (!role) {
            return NextResponse.json(
                { error: 'Event not found or no access' },
                { status: 404 }
            );
        }

        const supabase = createServiceClient();
        const { data: teams, error } = await supabase
            .from('event_teams')
            .select('*')
            .eq('event_id', id)
            .order('name', { ascending: true });

        if (error) {
            console.error('Error fetching event teams:', error);
            return NextResponse.json(
                { error: 'Failed to fetch teams' },
                { status: 500 }
            );
        }

        return NextResponse.json({ teams: teams || [] });
    } catch (error) {
        console.error('Event teams GET error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

// POST: Add a new team to an event (or update logo if it exists)
export async function POST(request: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params;
        const authClient = await createClient();
        const { data: { user } } = await authClient.auth.getUser();

        if (!user) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const role = await getEventRole(user.id, id);
        if (!role) {
            return NextResponse.json(
                { error: 'Event not found or no access' },
                { status: 404 }
            );
        }

        const body = await request.json();
        const { name, logo_url } = body;

        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            return NextResponse.json(
                { error: 'Team name is required' },
                { status: 400 }
            );
        }

        const supabase = createServiceClient();

        // Upsert: insert or update logo if team name already exists for this event
        const { data: team, error } = await supabase
            .from('event_teams')
            .upsert(
                {
                    event_id: id,
                    name: name.trim(),
                    logo_url: logo_url || null,
                },
                { onConflict: 'event_id,name' }
            )
            .select()
            .single();

        if (error) {
            console.error('Error upserting event team:', error);
            return NextResponse.json(
                { error: `Failed to save team: ${error.message}` },
                { status: 500 }
            );
        }

        return NextResponse.json({ team }, { status: 201 });
    } catch (error) {
        console.error('Event teams POST error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
