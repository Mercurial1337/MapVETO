import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
    const hostname = request.headers.get('host') || '';
    const pathname = request.nextUrl.pathname;

    // Determine if we're on localhost (dev) or production
    const isLocalhost = hostname.includes('localhost') || hostname.includes('127.0.0.1');

    // Extract subdomain
    let subdomain: string | null = null;

    if (!isLocalhost) {
        // Production: extract subdomain from hostname
        // e.g., "mapveto.emeaclash.com" -> "mapveto"
        // e.g., "emeaclash.com" -> null (root domain)
        // e.g., "www.emeaclash.com" -> "www"
        const parts = hostname.replace(/:\d+$/, '').split('.');
        if (parts.length > 2) {
            subdomain = parts[0];
        }
    } else {
        // Local development: use query parameter ?subdomain=xxx for testing
        // e.g., localhost:3000?subdomain=mapveto -> serves map veto app
        // e.g., localhost:3000 -> serves landing page (root domain behavior)
        subdomain = request.nextUrl.searchParams.get('subdomain');
    }

    // --- SUBDOMAIN: mapveto.emeaclash.com ---
    // Serves the existing map veto app as-is
    if (subdomain === 'mapveto') {
        // Pass through to existing Supabase session middleware
        return await updateSession(request);
    }

    // --- ROOT DOMAIN: emeaclash.com (or www.emeaclash.com) ---
    if (!subdomain || subdomain === 'www') {
        // Don't rewrite API routes, static files, or Next.js internals
        if (
            pathname.startsWith('/api') ||
            pathname.startsWith('/_next') ||
            pathname.includes('.')  // static files like .png, .svg, etc.
        ) {
            return NextResponse.next();
        }

        // Rewrite the root path to our landing page
        if (pathname === '/') {
            const url = request.nextUrl.clone();
            url.pathname = '/landing';
            return NextResponse.rewrite(url);
        }

        // For /landing path, let it pass through
        if (pathname.startsWith('/landing')) {
            return NextResponse.next();
        }

        // For any other path on root domain (e.g., /admin, /match/...),
        // redirect to the mapveto subdomain where the app lives
        if (!isLocalhost) {
            return NextResponse.redirect(
                `https://mapveto.emeaclash.com${pathname}${request.nextUrl.search}`
            );
        }

        // In local dev, just pass through (no subdomain redirect possible)
        return await updateSession(request);
    }

    // --- OTHER SUBDOMAINS (future: graphics, onsync, etc.) ---
    // For now, just pass through
    return NextResponse.next();
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         */
        '/((?!_next/static|_next/image).*)',
    ],
};
