import { NextRequest, NextResponse } from 'next/server';
import { google, sheets_v4 } from 'googleapis';
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
        if (event_id && event_id !== 'all') {
            query = query.eq('event_id', event_id);
        }

        const { data: matches, error: fetchError } = await query;

        if (fetchError) throw fetchError;
        if (!matches || matches.length === 0) {
            return NextResponse.json({ message: 'No completed matches found for the given criteria' });
        }

        // 2. Determine sheet ID - use provided sheet_id, or event's default sheet_id
        let targetSheetId = sheet_id;

        // If exporting for a specific event and no sheet_id provided, use event's default
        if (!targetSheetId && event_id && event_id !== 'all') {
            const firstMatchWithEvent = (matches as MatchData[]).find(m => m.events?.[0]?.google_sheet_id);
            if (firstMatchWithEvent?.events?.[0]?.google_sheet_id) {
                targetSheetId = firstMatchWithEvent.events[0].google_sheet_id;
            }
        }

        if (!targetSheetId) {
            return NextResponse.json({ error: 'Google Sheet ID is required. Either provide one or set a default in the event settings.' }, { status: 400 });
        }

        // 3. Fetch observer links for all matches
        const matchIds = matches.map((m: MatchData) => m.id);
        const { data: allLinks } = await supabase
            .from('match_links')
            .select('match_id, token')
            .in('match_id', matchIds)
            .eq('link_type', 'observer');

        const observerTokens: Record<string, string> = {};
        allLinks?.forEach((link: { match_id: string; token: string }) => {
            observerTokens[link.match_id] = link.token;
        });

        // 4. Fetch activity logs for all matches
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

        // 6. Group matches by event for per-event sheet tabs
        const matchesByEvent: Record<string, MatchData[]> = {};
        (matches as MatchData[]).forEach(match => {
            const eventName = match.events?.[0]?.name || 'Standalone Matches';
            if (!matchesByEvent[eventName]) {
                matchesByEvent[eventName] = [];
            }
            matchesByEvent[eventName].push(match);
        });

        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://your-app.vercel.app';

        // 7. Get existing sheet tabs
        const spreadsheet = await sheets.spreadsheets.get({
            spreadsheetId: targetSheetId,
        });
        const existingSheets = spreadsheet.data.sheets?.map(s => s.properties?.title) || [];

        // 8. Process each event group
        for (const [eventName, eventMatches] of Object.entries(matchesByEvent)) {
            // Sanitize sheet name (max 100 chars, no special chars)
            const sheetName = eventName.replace(/[\\/*?[\]:]/g, '_').substring(0, 100);

            // Create sheet tab if it doesn't exist
            if (!existingSheets.includes(sheetName)) {
                try {
                    await sheets.spreadsheets.batchUpdate({
                        spreadsheetId: targetSheetId,
                        requestBody: {
                            requests: [{
                                addSheet: {
                                    properties: { title: sheetName }
                                }
                            }]
                        }
                    });
                    existingSheets.push(sheetName);
                } catch (err) {
                    console.error(`Failed to create sheet tab "${sheetName}":`, err);
                    // Continue with default Sheet1 if creation fails
                }
            }

            // Format rows for this event
            const header = ['Date', 'Match', 'Observer Link', 'Activity Log'];

            const rows = eventMatches.map(match => {
                // Format date
                const date = new Date(match.completed_at).toISOString().split('T')[0];

                // Format match name
                const matchName = `${match.team_a_name} vs ${match.team_b_name}`;

                // Format observer link as hyperlink formula
                const token = observerTokens[match.id];
                const observerUrl = token ? `${baseUrl}/match/${match.id}?token=${token}` : '';
                const observerLink = token ? `=HYPERLINK("${observerUrl}", "View Match")` : 'No link';

                // Format activity log from match_logs
                const logs = matchLogsMap[match.id] || [];
                const activityLog = formatActivityLog(logs, match.team_a_name, match.team_b_name);

                return [date, matchName, observerLink, activityLog];
            });

            // Append to the sheet
            await sheets.spreadsheets.values.append({
                spreadsheetId: targetSheetId,
                range: `${sheetName}!A1`,
                valueInputOption: 'USER_ENTERED', // Allows formulas like HYPERLINK to work
                requestBody: {
                    values: [header, ...rows],
                },
            });
        }

        return NextResponse.json({ success: true, count: matches.length });
    } catch (error: unknown) {
        console.error('Export Error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to export to Google Sheets';
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}

/**
 * Format activity logs into a readable string
 */
function formatActivityLog(logs: MatchLog[], teamAName: string, teamBName: string): string {
    if (logs.length === 0) return 'No activity recorded';

    return logs.map(log => {
        const actor = log.actor === 'team_a' ? teamAName :
            log.actor === 'team_b' ? teamBName :
                log.actor === 'system' ? 'System' : log.actor;

        const action = log.action_type.toUpperCase();

        if (log.action_type === 'ban') {
            return `${actor} BANNED ${log.map_id || 'unknown'}`;
        } else if (log.action_type === 'pick') {
            return `${actor} PICKED ${log.map_id || 'unknown'}`;
        } else if (log.action_type === 'side') {
            return `${actor} picked ${log.side_choice?.toUpperCase() || 'SIDE'}`;
        } else if (log.action_type === 'decider') {
            return `DECIDER: ${log.map_id || 'unknown'}`;
        } else {
            return `${actor} ${action}`;
        }
    }).join(' | ');
}
