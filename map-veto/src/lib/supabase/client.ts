import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
    return createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
}

// Admin pages only need the signed-in user's id to scope their queries. The middleware has
// already verified the user with Supabase for every /admin request, and API routes and RLS
// verify again, so read the stored session (no network round trip; refreshed if expired).
export async function getSessionUser(supabase: ReturnType<typeof createClient>) {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user ?? null;
}
