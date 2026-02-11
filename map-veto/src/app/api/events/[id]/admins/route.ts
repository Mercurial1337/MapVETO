import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient, createClient } from '@/lib/supabase/server';
import { getEventRole } from '@/lib/auth/eventAuth';
import { z } from 'zod';

const AddAdminSchema = z.object({
    email: z.string().email(),
});

interface RouteParams {
    params: Promise<{ id: string }>;
}

// GET: List all admins for an event (owner only)
export async function GET(request: NextRequest, { params }: RouteParams) {
    try {
        const { id: eventId } = await params;
        const authClient = await createClient();
        const { data: { user } } = await authClient.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const role = await getEventRole(user.id, eventId);
        if (role !== 'owner') {
            return NextResponse.json({ error: 'Only the event owner can manage admins' }, { status: 403 });
        }

        const supabase = createServiceClient();

        // Get admins with their email from auth.users
        const { data: admins, error } = await supabase
            .from('event_admins')
            .select('id, user_id, role, created_at')
            .eq('event_id', eventId)
            .order('created_at', { ascending: true });

        if (error) {
            console.error('Error fetching admins:', error);
            return NextResponse.json({ error: 'Failed to fetch admins' }, { status: 500 });
        }

        // Fetch user emails for each admin
        const adminsWithEmail = await Promise.all(
            (admins || []).map(async (admin) => {
                const { data: { user: adminUser } } = await supabase.auth.admin.getUserById(admin.user_id);
                return {
                    ...admin,
                    email: adminUser?.email || 'Unknown',
                };
            })
        );

        return NextResponse.json({ admins: adminsWithEmail });
    } catch (error) {
        console.error('Event admins GET error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// POST: Add an admin by email (owner only)
export async function POST(request: NextRequest, { params }: RouteParams) {
    try {
        const { id: eventId } = await params;
        const authClient = await createClient();
        const { data: { user } } = await authClient.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const role = await getEventRole(user.id, eventId);
        if (role !== 'owner') {
            return NextResponse.json({ error: 'Only the event owner can manage admins' }, { status: 403 });
        }

        const body = await request.json();
        const validationResult = AddAdminSchema.safeParse(body);
        if (!validationResult.success) {
            return NextResponse.json(
                { error: validationResult.error.issues[0].message },
                { status: 400 }
            );
        }

        const { email } = validationResult.data;
        const supabase = createServiceClient();

        // Look up the user by email
        const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();

        if (listError) {
            console.error('Error listing users:', listError);
            return NextResponse.json({ error: 'Failed to look up user' }, { status: 500 });
        }

        const targetUser = users?.find(u => u.email?.toLowerCase() === email.toLowerCase());

        if (!targetUser) {
            return NextResponse.json(
                { error: 'No registered user found with that email address' },
                { status: 404 }
            );
        }

        // Can't add the owner as an admin
        if (targetUser.id === user.id) {
            return NextResponse.json(
                { error: 'You are already the owner of this event' },
                { status: 400 }
            );
        }

        // Check if already an admin
        const { data: existing } = await supabase
            .from('event_admins')
            .select('id')
            .eq('event_id', eventId)
            .eq('user_id', targetUser.id)
            .single();

        if (existing) {
            return NextResponse.json(
                { error: 'This user is already an admin for this event' },
                { status: 409 }
            );
        }

        // Add the admin
        const { data: admin, error: insertError } = await supabase
            .from('event_admins')
            .insert({
                event_id: eventId,
                user_id: targetUser.id,
                role: 'admin',
                added_by: user.id,
            })
            .select()
            .single();

        if (insertError) {
            console.error('Error adding admin:', insertError);
            return NextResponse.json(
                { error: `Failed to add admin: ${insertError.message}` },
                { status: 500 }
            );
        }

        return NextResponse.json({
            admin: {
                ...admin,
                email: targetUser.email,
            }
        }, { status: 201 });
    } catch (error) {
        console.error('Event admins POST error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// DELETE: Remove an admin (owner only)
export async function DELETE(request: NextRequest, { params }: RouteParams) {
    try {
        const { id: eventId } = await params;
        const authClient = await createClient();
        const { data: { user } } = await authClient.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const role = await getEventRole(user.id, eventId);
        if (role !== 'owner') {
            return NextResponse.json({ error: 'Only the event owner can manage admins' }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const adminId = searchParams.get('adminId');

        if (!adminId) {
            return NextResponse.json({ error: 'adminId query parameter is required' }, { status: 400 });
        }

        const supabase = createServiceClient();

        const { error } = await supabase
            .from('event_admins')
            .delete()
            .eq('id', adminId)
            .eq('event_id', eventId);

        if (error) {
            console.error('Error removing admin:', error);
            return NextResponse.json(
                { error: `Failed to remove admin: ${error.message}` },
                { status: 500 }
            );
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Event admins DELETE error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
