import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { createServiceClient } from '@/lib/supabase/server';

interface MatchLog {
    action_type: string;
    actor: string;
    map_id: string | null;
    side_choice: string | null;
    step_number: number;
}

interface MatchData {
    id: string;
    team_a_name: string;
    team_b_name: string;
    completed_at: string;
    event_id: string | null;
    events: { name: string; google_sheet_id: string | null }[] | null;
}

interface MapInfo {
    id: string;
    name: string;
}

export async function POST(req: NextRequest) {
    try {
        const { date_from, date_to, event_id, sheet_id } = await req.json();

        const supabase = createServiceClient();

        // 1. Fetch matches based on criteria
        let query = supabase
            .from('matches')
            .select('id, team_a_name, team_b_name, completed_at, event_id, events(name, google_sheet_id)')
            .eq('status', 'completed')
            .order('completed_at', { ascending: true });

        if (date_from) {
            query = query.gte('completed_at', `${date_from}T00:00:00Z`);
        }
        if (date_to) {
            query = query.lte('completed_at', `${date_to}T23:59:59.999Z`);
        }
        // Filter by event - 'standalone' means matches with no event
        if (event_id === 'standalone') {
            query = query.is('event_id', null);
        } else if (event_id && event_id !== 'all') {
            query = query.eq('event_id', event_id);
        }

        const { data: matches, error: fetchError } = await query;

        if (fetchError) throw fetchError;
        if (!matches || matches.length === 0) {
            return NextResponse.json({ message: 'No completed matches found for the given criteria' });
        }

        // 2. Determine sheet ID - use provided sheet_id, or event's default sheet_id
        let targetSheetId = sheet_id;

        if (!targetSheetId && event_id && event_id !== 'all') {
            const firstMatchWithEvent = (matches as MatchData[]).find(m => m.events?.[0]?.google_sheet_id);
            if (firstMatchWithEvent?.events?.[0]?.google_sheet_id) {
                targetSheetId = firstMatchWithEvent.events[0].google_sheet_id;
            }
        }

        if (!targetSheetId) {
            return NextResponse.json({ error: 'Google Sheet ID is required. Either provide one or set a default in the event settings.' }, { status: 400 });
        }

        // 3. Fetch all maps to get names
        const { data: allMaps } = await supabase
            .from('maps')
            .select('id, name');

        const mapNames: Record<string, string> = {};
        allMaps?.forEach((map: MapInfo) => {
            mapNames[map.id] = map.name;
        });

        // 4. Fetch activity logs for all matches
        const matchIds = matches.map((m: MatchData) => m.id);
        const { data: allLogs } = await supabase
            .from('match_logs')
            .select('match_id, action_type, actor, map_id, side_choice, step_number')
            .in('match_id', matchIds)
            .order('step_number', { ascending: true });

        const matchLogsMap: Record<string, MatchLog[]> = {};
        allLogs?.forEach((log: MatchLog & { match_id: string }) => {
            if (!matchLogsMap[log.match_id]) {
                matchLogsMap[log.match_id] = [];
            }
            matchLogsMap[log.match_id].push(log);
        });

        // 5. Prepare Google Sheets Auth
        const rawEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
        const rawKey = process.env.GOOGLE_PRIVATE_KEY;

        if (!rawEmail || !rawKey) {
            console.error('Missing Google Sheets credentials in environment variables');
            return NextResponse.json({
                error: 'Server configuration error: Google credentials missing',
                details: `Email: ${rawEmail ? 'Set' : 'Missing'}, Key: ${rawKey ? 'Set' : 'Missing'}`
            }, { status: 500 });
        }

        const privateKey = rawKey
            .replace(/^["']|["']$/g, '')
            .replace(/\\n/g, '\n');

        const auth = new google.auth.GoogleAuth({
            credentials: {
                client_email: rawEmail,
                private_key: privateKey,
            },
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });

        const sheets = google.sheets({ version: 'v4', auth });

        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://mapveto-nine.vercel.app';

        // 6. Check if sheet already has data (to skip header)
        const existingData = await sheets.spreadsheets.values.get({
            spreadsheetId: targetSheetId,
            range: 'Sheet1!A1:A1',
        });

        const hasExistingData = existingData.data.values && existingData.data.values.length > 0;

        // 7. Format rows
        const rows = (matches as MatchData[]).map(match => {
            // Format date
            const date = new Date(match.completed_at).toISOString().split('T')[0];

            // Format match name
            const matchName = `${match.team_a_name} vs ${match.team_b_name}`;

            // Format observer link - use simple ?token=observer format
            const observerUrl = `${baseUrl}/match/${match.id}?token=observer`;
            const observerLink = `=HYPERLINK("${observerUrl}", "View Match")`;

            // Format activity log from match_logs with proper map names
            const logs = matchLogsMap[match.id] || [];
            const activityLog = formatActivityLog(logs, match.team_a_name, match.team_b_name, mapNames);

            return [date, matchName, observerLink, activityLog];
        });

        // 8. Prepare values to write
        const valuesToWrite = hasExistingData
            ? rows  // No header if data exists
            : [['Date', 'Match', 'Observer Link', 'Activity Log'], ...rows];  // Include header

        // 9. Append to the first sheet (Sheet1)
        await sheets.spreadsheets.values.append({
            spreadsheetId: targetSheetId,
            range: 'Sheet1!A1',
            valueInputOption: 'USER_ENTERED',
            requestBody: {
                values: valuesToWrite,
            },
        });

        return NextResponse.json({ success: true, count: matches.length });
    } catch (error: unknown) {
        console.error('Export Error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to export to Google Sheets';
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}

/**
 * Format activity logs into a readable string matching the UI format
 */
function formatActivityLog(
    logs: MatchLog[],
    teamAName: string,
    teamBName: string,
    mapNames: Record<string, string>
): string {
    if (logs.length === 0) return 'No activity recorded';

    let pickCounter = 0;
    let lastPickedMap = '';

    return logs.map(log => {
        const actor = log.actor === 'team_a' ? teamAName :
            log.actor === 'team_b' ? teamBName :
                log.actor === 'system' ? 'System' : log.actor;

        const mapName = log.map_id ? (mapNames[log.map_id] || log.map_id) : 'unknown';

        if (log.action_type === 'ban') {
            return `${actor} bans ${mapName}`;
        } else if (log.action_type === 'pick') {
            pickCounter++;
            lastPickedMap = mapName;
            return `${actor} picks ${mapName} (Map ${pickCounter})`;
        } else if (log.action_type === 'side') {
            const side = log.side_choice === 'attack' ? 'Attack' : 'Defense';
            return `${actor} picks ${side} for ${lastPickedMap}`;
        } else if (log.action_type === 'decider') {
            pickCounter++;
            lastPickedMap = mapName;
            return `${mapName} (Map ${pickCounter}) is decider`;
        } else if (log.action_type === 'coin_toss') {
            return `${actor} wins coin toss`;
        } else {
            return `${actor} ${log.action_type}`;
        }
    }).join(' | ');
}
