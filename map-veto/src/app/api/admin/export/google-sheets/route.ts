import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { createServiceClient } from '@/lib/supabase/server';
import { PickedMap, BannedMap } from '@/types';

export async function POST(req: NextRequest) {
    try {
        const { date_from, date_to, event_id, sheet_id } = await req.json();

        if (!sheet_id) {
            return NextResponse.json({ error: 'Google Sheet ID is required' }, { status: 400 });
        }

        const supabase = createServiceClient();

        // 1. Fetch matches based on criteria
        let query = supabase
            .from('matches')
            .select('*, events(name), match_state(*)')
            .eq('status', 'completed')
            .order('completed_at', { ascending: true });

        if (date_from) {
            query = query.gte('completed_at', `${date_from}T00:00:00Z`);
        }
        if (date_to) {
            query = query.lte('completed_at', `${date_to}T23:59:59.999Z`);
        }
        if (event_id && event_id !== 'all') {
            query = query.eq('event_id', event_id);
        }

        const { data: matches, error: fetchError } = await query;

        if (fetchError) throw fetchError;
        if (!matches || matches.length === 0) {
            return NextResponse.json({ message: 'No completed matches found for the given criteria' });
        }

        // 2. Prepare Google Sheets Auth
        const auth = new google.auth.GoogleAuth({
            credentials: {
                client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
                private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
            },
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });

        const sheets = google.sheets({ version: 'v4', auth });

        // 3. Format data for the sheet
        const header = [
            'Match ID',
            'Event',
            'Date (UTC)',
            'Team A',
            'Team B',
            'Format',
            'Winner',
            'Map 1', 'Side Picked By', 'Side Choice',
            'Map 2', 'Side Picked By (if Bo3/Bo5)', 'Side Choice',
            'Map 3', 'Side Picked By (if Bo3)', 'Side Choice',
            'Veto History (Sequential)'
        ];

        const rows = matches.map(match => {
            const state = match.match_state;
            const pickedMaps = (state?.picked_maps || []) as PickedMap[];

            // Map 1 info
            const m1 = pickedMaps.find((m: PickedMap) => m.map_number === 1);
            // Map 2 info
            const m2 = pickedMaps.find((m: PickedMap) => m.map_number === 2);
            // Map 3 info
            const m3 = pickedMaps.find((m: PickedMap) => m.map_number === 3);

            // Winner logic (simplified: check results or status)
            // In our system, the match is completed when veto ends. 
            // We don't track the actual game score in this VETO app, 
            // but we can at least show the veto results.

            const vetoHistory = [
                ...((state?.banned_maps || []) as BannedMap[]).map((m: BannedMap) => `${m.banned_by} BANNED ${m.map_id}`),
                ...pickedMaps.map((m: PickedMap) => `${m.picked_by} PICKED ${m.map_id} (${m.side || 'No side chosen yet'})`)
            ].join(' | ');

            return [
                match.id,
                match.events?.name || 'Standalone',
                new Date(match.completed_at).toISOString().split('T')[0],
                match.team_a_name,
                match.team_b_name,
                match.format.toUpperCase(),
                'N/A', // Score not tracked in VETO app
                m1?.map_id || '-', m1?.side_picked_by || '-', m1?.side || '-',
                m2?.map_id || '-', m2?.side_picked_by || '-', m2?.side || '-',
                m3?.map_id || '-', m3?.side_picked_by || '-', m3?.side || '-',
                vetoHistory
            ];
        });

        // 4. Update the sheet
        // We'll append to the sheet to avoid overwriting existing data if multiple exports happen, 
        // or we can overwrite a specific range. Let's use append for now.

        await sheets.spreadsheets.values.append({
            spreadsheetId: sheet_id,
            range: 'Sheet1!A1',
            valueInputOption: 'RAW',
            requestBody: {
                values: [header, ...rows],
            },
        });

        return NextResponse.json({ success: true, count: matches.length });
    } catch (error: any) {
        console.error('Export Error:', error);
        return NextResponse.json({ error: error.message || 'Failed to export to Google Sheets' }, { status: 500 });
    }
}
