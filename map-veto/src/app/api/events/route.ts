import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient, createClient } from '@/lib/supabase/server';
import { z } from 'zod';

// Request validation schema for creating an event
const CreateEventSchema = z.object({
    name: z.string().min(1).max(200),
    logo_url: z.string().url().optional().nullable(),
    coin_image_url: z.string().url().optional().nullable(),
    custom_font_url: z.string().url().optional().nullable(),
    custom_font_name: z.string().max(100).optional().nullable(),
    google_sheet_id: z.string().max(100).optional().nullable(),
});

// GET: List events for current user
export async function GET() {
    try {
        const authClient = await createClient();
        const { data: { user } } = await authClient.auth.getUser();

        if (!user) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const supabase = createServiceClient();
        const { data: events, error } = await supabase
            .from('events')
            .select(`
                *,
                matches:matches(count)
            `)
            .eq('created_by', user.id)
            .eq('is_active', true)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching events:', error);
            return NextResponse.json(
                { error: 'Failed to fetch events' },
                { status: 500 }
            );
        }

        return NextResponse.json({ events });
    } catch (error) {
        console.error('Events GET error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

// POST: Create a new event
export async function POST(request: NextRequest) {
    try {
        const authClient = await createClient();
        const { data: { user } } = await authClient.auth.getUser();

        if (!user) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const body = await request.json();

        // Validate request body
        const validationResult = CreateEventSchema.safeParse(body);
        if (!validationResult.success) {
            return NextResponse.json(
                { error: validationResult.error.issues[0].message },
                { status: 400 }
            );
        }

        const data = validationResult.data;
        const supabase = createServiceClient();

        // Create the event
        const { data: event, error } = await supabase
            .from('events')
            .insert({
                name: data.name,
                logo_url: data.logo_url || null,
                coin_image_url: data.coin_image_url || null,
                custom_font_url: data.custom_font_url || null,
                custom_font_name: data.custom_font_name || null,
                google_sheet_id: data.google_sheet_id || null,
                created_by: user.id,
            })
            .select()
            .single();

        if (error) {
            console.error('Event creation error:', error);
            return NextResponse.json(
                { error: `Failed to create event: ${error.message}` },
                { status: 500 }
            );
        }

        return NextResponse.json({ event }, { status: 201 });
    } catch (error) {
        console.error('Events POST error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
