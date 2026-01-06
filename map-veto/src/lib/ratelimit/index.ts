import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { NextRequest, NextResponse } from 'next/server';

// Initialize Redis client (uses environment variables)
const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL || '',
    token: process.env.UPSTASH_REDIS_REST_TOKEN || '',
});

// Rate limiters for different endpoints
const rateLimiters = {
    // Veto actions: 10 requests per 10 seconds per IP
    vetoAction: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(10, '10 s'),
        analytics: true,
        prefix: 'ratelimit:veto:action',
    }),

    // Coin toss: 5 requests per minute per IP
    coinToss: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(5, '1 m'),
        analytics: true,
        prefix: 'ratelimit:veto:coin-toss',
    }),

    // Match creation: 20 requests per minute per IP
    createMatch: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(20, '1 m'),
        analytics: true,
        prefix: 'ratelimit:matches:create',
    }),

    // General API: 100 requests per minute per IP
    general: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(100, '1 m'),
        analytics: true,
        prefix: 'ratelimit:general',
    }),
};

export type RateLimitType = keyof typeof rateLimiters;

export interface RateLimitResult {
    success: boolean;
    limit: number;
    remaining: number;
    reset: number;
}

/**
 * Check rate limit for a request
 */
export async function checkRateLimit(
    request: NextRequest,
    type: RateLimitType = 'general'
): Promise<RateLimitResult> {
    // Skip rate limiting if Redis is not configured
    if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
        return { success: true, limit: 0, remaining: 0, reset: 0 };
    }

    try {
        // Get identifier (IP address or forwarded IP)
        const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim()
            || request.headers.get('x-real-ip')
            || 'anonymous';

        const limiter = rateLimiters[type];
        const { success, limit, remaining, reset } = await limiter.limit(ip);

        return { success, limit, remaining, reset };
    } catch (error) {
        // If rate limiting fails, allow the request (fail open)
        console.error('Rate limit check failed:', error);
        return { success: true, limit: 0, remaining: 0, reset: 0 };
    }
}

/**
 * Rate limit middleware wrapper
 */
export function withRateLimit(
    handler: (request: NextRequest) => Promise<NextResponse>,
    type: RateLimitType = 'general'
) {
    return async (request: NextRequest): Promise<NextResponse> => {
        const { success, limit, remaining, reset } = await checkRateLimit(request, type);

        if (!success) {
            return NextResponse.json(
                {
                    error: 'Too many requests. Please slow down.',
                    retryAfter: Math.ceil((reset - Date.now()) / 1000),
                },
                {
                    status: 429,
                    headers: {
                        'X-RateLimit-Limit': limit.toString(),
                        'X-RateLimit-Remaining': '0',
                        'X-RateLimit-Reset': reset.toString(),
                        'Retry-After': Math.ceil((reset - Date.now()) / 1000).toString(),
                    },
                }
            );
        }

        const response = await handler(request);

        // Add rate limit headers to successful responses
        response.headers.set('X-RateLimit-Limit', limit.toString());
        response.headers.set('X-RateLimit-Remaining', remaining.toString());
        response.headers.set('X-RateLimit-Reset', reset.toString());

        return response;
    };
}
