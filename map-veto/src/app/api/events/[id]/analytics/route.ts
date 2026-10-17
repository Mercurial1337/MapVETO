import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getEventRole } from '@/lib/auth/eventAuth';
import { aggregateVeto, type AnalyticsMatch } from '@/lib/analytics/veto';

const querySchema = z.object({
  format: z.enum(['bo1', 'bo3', 'bo5']).optional(),
  day: z.string().max(200).optional(), round: z.string().max(200).optional(),
});
const headers = { 'Cache-Control': 'private, no-store' };
const one = <T,>(value: T | T[] | null): T | null => Array.isArray(value) ? value[0] || null : value;
interface Row extends Omit<AnalyticsMatch, 'day' | 'round' | 'state'> {
  match_state: AnalyticsMatch['state'] | AnalyticsMatch['state'][];
  source: { tab_title: string; round: string | null } | { tab_title: string; round: string | null }[] | null;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: 'Invalid event ID.' }, { status: 400, headers });
    const auth = await createClient();
    const { data: { user } } = await auth.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
    if (!await getEventRole(user.id, id)) return NextResponse.json({ error: 'Event not found' }, { status: 404, headers });
    const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!parsed.success) return NextResponse.json({ error: 'Invalid analytics filters.' }, { status: 400, headers });
    const db = createServiceClient();
    // Keyset pagination avoids the REST row limit and offset drift. No logs, tokens or passwords are fetched.
    const matches: AnalyticsMatch[] = [];
    let cursor: string | null = null;
    while (true) {
      let query = db.from('matches').select(`id,team_a_name,team_b_name,format,status,completed_at,
        match_state!inner(is_complete,available_maps,banned_maps,picked_maps),
        source:sheet_match_sources!matches_sheet_source_id_fkey(tab_title,round:created_snapshot->>round)`)
        .eq('event_id', id).eq('status', 'completed').eq('match_state.is_complete', true).order('id').limit(250);
      if (cursor) query = query.gt('id', cursor);
      const { data, error } = await query;
      if (error) throw error;
      const rows = data as unknown as Row[];
      for (const row of rows) {
        const source = one(row.source);
        matches.push({ id: row.id, team_a_name: row.team_a_name, team_b_name: row.team_b_name,
          format: row.format, status: row.status, completed_at: row.completed_at,
          day: source?.tab_title || '', round: source?.round || '', state: one(row.match_state) });
      }
      if (rows.length < 250) break;
      cursor = rows[rows.length - 1].id;
    }
    const { data: maps, error } = await db.from('maps').select('id,name').order('id');
    if (error) throw error;
    return NextResponse.json(aggregateVeto(matches, maps || [], parsed.data), { headers });
  } catch (error) {
    console.error('Event analytics error:', error);
    return NextResponse.json({ error: 'Could not load veto analytics. Please try again.' }, { status: 500, headers });
  }
}
