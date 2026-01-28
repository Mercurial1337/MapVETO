import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { createServiceClient } from '@/lib/supabase/server';

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

        // 3. Prepare Google Sheets Auth
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

        // 4. Check if sheet already has data (to skip header)
        const existingData = await sheets.spreadsheets.values.get({
            spreadsheetId: targetSheetId,
            range: 'Sheet1!A1:A1',
        });

        const hasExistingData = existingData.data.values && existingData.data.values.length > 0;

        // 5. Get sheet metadata to find first sheet ID for formatting
        const spreadsheet = await sheets.spreadsheets.get({
            spreadsheetId: targetSheetId,
        });
        const firstSheetId = spreadsheet.data.sheets?.[0]?.properties?.sheetId || 0;

        // 6. Format rows (3 columns: Date, Match, Observer Link)
        const rows = (matches as MatchData[]).map(match => {
            // Format date
            const date = new Date(match.completed_at).toISOString().split('T')[0];

            // Format match name
            const matchName = `${match.team_a_name} vs ${match.team_b_name}`;

            // Format observer link - use simple ?token=observer format
            const observerUrl = `${baseUrl}/match/${match.id}?token=observer`;
            const observerLink = `=HYPERLINK("${observerUrl}", "View Match")`;

            return [date, matchName, observerLink];
        });

        // 7. Prepare values to write
        const header = ['Date', 'Match', 'Observer Link'];
        const valuesToWrite = hasExistingData
            ? rows  // No header if data exists
            : [header, ...rows];  // Include header

        // 8. Append to the first sheet (Sheet1)
        await sheets.spreadsheets.values.append({
            spreadsheetId: targetSheetId,
            range: 'Sheet1!A1',
            valueInputOption: 'USER_ENTERED',
            requestBody: {
                values: valuesToWrite,
            },
        });

        // 9. Apply formatting only on first export (when we added header)
        if (!hasExistingData) {
            await sheets.spreadsheets.batchUpdate({
                spreadsheetId: targetSheetId,
                requestBody: {
                    requests: [
                        // Format header row - bold white text on dark background
                        {
                            repeatCell: {
                                range: {
                                    sheetId: firstSheetId,
                                    startRowIndex: 0,
                                    endRowIndex: 1,
                                    startColumnIndex: 0,
                                    endColumnIndex: 3,
                                },
                                cell: {
                                    userEnteredFormat: {
                                        backgroundColor: { red: 0.2, green: 0.2, blue: 0.25 },
                                        textFormat: {
                                            bold: true,
                                            foregroundColor: { red: 1, green: 1, blue: 1 },
                                            fontSize: 11,
                                        },
                                        horizontalAlignment: 'CENTER',
                                        verticalAlignment: 'MIDDLE',
                                        padding: { top: 8, bottom: 8, left: 8, right: 8 },
                                    },
                                },
                                fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,padding)',
                            },
                        },
                        // Set column widths
                        {
                            updateDimensionProperties: {
                                range: {
                                    sheetId: firstSheetId,
                                    dimension: 'COLUMNS',
                                    startIndex: 0,
                                    endIndex: 1,
                                },
                                properties: { pixelSize: 120 }, // Date column
                                fields: 'pixelSize',
                            },
                        },
                        {
                            updateDimensionProperties: {
                                range: {
                                    sheetId: firstSheetId,
                                    dimension: 'COLUMNS',
                                    startIndex: 1,
                                    endIndex: 2,
                                },
                                properties: { pixelSize: 250 }, // Match column
                                fields: 'pixelSize',
                            },
                        },
                        {
                            updateDimensionProperties: {
                                range: {
                                    sheetId: firstSheetId,
                                    dimension: 'COLUMNS',
                                    startIndex: 2,
                                    endIndex: 3,
                                },
                                properties: { pixelSize: 150 }, // Observer Link column
                                fields: 'pixelSize',
                            },
                        },
                        // Freeze header row
                        {
                            updateSheetProperties: {
                                properties: {
                                    sheetId: firstSheetId,
                                    gridProperties: { frozenRowCount: 1 },
                                },
                                fields: 'gridProperties.frozenRowCount',
                            },
                        },
                        // Center align Date column for all data
                        {
                            repeatCell: {
                                range: {
                                    sheetId: firstSheetId,
                                    startRowIndex: 1,
                                    startColumnIndex: 0,
                                    endColumnIndex: 1,
                                },
                                cell: {
                                    userEnteredFormat: {
                                        horizontalAlignment: 'CENTER',
                                    },
                                },
                                fields: 'userEnteredFormat.horizontalAlignment',
                            },
                        },
                        // Center align Observer Link column
                        {
                            repeatCell: {
                                range: {
                                    sheetId: firstSheetId,
                                    startRowIndex: 1,
                                    startColumnIndex: 2,
                                    endColumnIndex: 3,
                                },
                                cell: {
                                    userEnteredFormat: {
                                        horizontalAlignment: 'CENTER',
                                    },
                                },
                                fields: 'userEnteredFormat.horizontalAlignment',
                            },
                        },
                    ],
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

// Activity log formatting - commented out for now, will fix later
/*
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
*/
