import { createServiceClient } from '@/lib/supabase/server';

export type EventRole = 'owner' | 'admin' | null;

/**
 * Returns the user's role for a given event:
 * - 'owner' if createdBy matches
 * - 'admin' if the user is in the event_admins table
 * - null if they have no access
 */
export async function getEventRole(userId: string, eventId: string): Promise<EventRole> {
    const supabase = createServiceClient();

    // Check ownership first
    const { data: event } = await supabase
        .from('events')
        .select('id')
        .eq('id', eventId)
        .eq('created_by', userId)
        .single();

    if (event) return 'owner';

    // Check if user is an admin
    const { data: adminEntry } = await supabase
        .from('event_admins')
        .select('id')
        .eq('event_id', eventId)
        .eq('user_id', userId)
        .single();

    if (adminEntry) return 'admin';

    return null;
}

/**
 * Convenience check — returns true if the user is either
 * the event owner or an admin.
 */
export async function canAccessEvent(userId: string, eventId: string): Promise<boolean> {
    const role = await getEventRole(userId, eventId);
    return role !== null;
}
