import { NextResponse } from 'next/server';

export async function vetoResponse(matchId: string, result: { new_state: unknown; match: unknown }) {
    // Database triggers publish invalidations at commit. Return immediately so
    // the acting browser need not wait for two additional broadcast requests.
    return NextResponse.json({ success: true, ...result });
}
