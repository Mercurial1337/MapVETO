import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient, createClient } from '@/lib/supabase/server';
import { getEventRole } from '@/lib/auth/eventAuth';
import { z } from 'zod';

// Request validation schema for updating an event
const UpdateEventSchema = z.object({
    name: z.string().min(1).max(200).optional(),
    logo_url: z.string().url().optional().nullable(),
    coin_image_url: z.string().url().optional().nullable(),
    custom_font_url: z.string().url().optional().nullable(),
    custom_font_name: z.string().max(100).optional().nullable(),
    google_sheet_id: z.string().max(100).optional().nullable(),
    is_active: z.boolean().optional(),
});

interface RouteParams {
    params: Promise<{ id: string }>;
}

// GET: Get single event by ID (owner or admin)
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
                { error: 'Event not found' },
                { status: 404 }
            );
        }

        const supabase = createServiceClient();
        const { data: event, error } = await supabase
            .from('events')
            .select('*')
            .eq('id', id)
            .single();

        if (error || !event) {
            return NextResponse.json(
                { error: 'Event not found' },
                { status: 404 }
            );
        }

        return NextResponse.json({ event, role });
    } catch (error) {
        console.error('Event GET error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

// PUT: Update an event (owner only - controls branding)
export async function PUT(request: NextRequest, { params }: RouteParams) {
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

        const body = await request.json();

        // Validate request body
        const validationResult = UpdateEventSchema.safeParse(body);
        if (!validationResult.success) {
            return NextResponse.json(
                { error: validationResult.error.issues[0].message },
                { status: 400 }
            );
        }

        const data = validationResult.data;
        const supabase = createServiceClient();

        // Verify ownership
        const { data: existing } = await supabase
            .from('events')
            .select('id')
            .eq('id', id)
            .eq('created_by', user.id)
            .single();

        if (!existing) {
            return NextResponse.json(
                { error: 'Event not found' },
                { status: 404 }
            );
        }

        // Update the event
        const { data: event, error } = await supabase
            .from('events')
            .update({
                ...(data.name !== undefined && { name: data.name }),
                ...(data.logo_url !== undefined && { logo_url: data.logo_url }),
                ...(data.coin_image_url !== undefined && { coin_image_url: data.coin_image_url }),
                ...(data.custom_font_url !== undefined && { custom_font_url: data.custom_font_url }),
                ...(data.custom_font_name !== undefined && { custom_font_name: data.custom_font_name }),
                ...(data.google_sheet_id !== undefined && { google_sheet_id: data.google_sheet_id }),
                ...(data.is_active !== undefined && { is_active: data.is_active }),
            })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('Event update error:', error);
            return NextResponse.json(
                { error: `Failed to update event: ${error.message}` },
                { status: 500 }
            );
        }

        return NextResponse.json({ event });
    } catch (error) {
        console.error('Event PUT error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

// DELETE: Soft delete an event (set is_active to false)
export async function DELETE(request: NextRequest, { params }: RouteParams) {
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

        const supabase = createServiceClient();

        // Verify ownership and soft delete
        const { error } = await supabase
            .from('events')
            .update({ is_active: false })
            .eq('id', id)
            .eq('created_by', user.id);

        if (error) {
            console.error('Event delete error:', error);
            return NextResponse.json(
                { error: `Failed to delete event: ${error.message}` },
                { status: 500 }
            );
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Event DELETE error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
