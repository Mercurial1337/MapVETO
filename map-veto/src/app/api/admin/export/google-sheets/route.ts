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

        // Date filtering - don't use Z suffix to avoid timezone issues
        // Use local date boundaries
        if (date_from) {
            query = query.gte('completed_at', `${date_from}T00:00:00`);
        }
        if (date_to) {
            query = query.lte('completed_at', `${date_to}T23:59:59.999`);
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

        // 4. Get current sheet data to determine where to start
        const existingData = await sheets.spreadsheets.values.get({
            spreadsheetId: targetSheetId,
            range: 'Sheet1!A:A',
        });

        const existingRowCount = existingData.data.values?.length || 0;
        const hasExistingData = existingRowCount > 0;

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

        // 9. Calculate the row indices for the newly added data
        const newDataStartRow = hasExistingData ? existingRowCount : 1; // 0-indexed, skip header if first export
        const newDataEndRow = newDataStartRow + rows.length;
        const totalRows = hasExistingData ? existingRowCount + rows.length : 1 + rows.length;

        // 10. Build formatting requests
        const formatRequests: object[] = [];

        // Only add header and column formatting on first export
        if (!hasExistingData) {
            formatRequests.push(
                // Format header row - bold white text on dark purple background
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
                                backgroundColor: { red: 0.25, green: 0.15, blue: 0.35 },
                                textFormat: {
                                    bold: true,
                                    foregroundColor: { red: 1, green: 1, blue: 1 },
                                    fontSize: 11,
                                },
                                horizontalAlignment: 'CENTER',
                                verticalAlignment: 'MIDDLE',
                            },
                        },
                        fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)',
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
                        properties: { pixelSize: 120 },
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
                        properties: { pixelSize: 280 },
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
                        properties: { pixelSize: 150 },
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
                }
            );
        }

        // Add alternating row colors for ALL data rows
        for (let i = 1; i < totalRows; i++) {
            const isEvenRow = i % 2 === 0;
            formatRequests.push({
                repeatCell: {
                    range: {
                        sheetId: firstSheetId,
                        startRowIndex: i,
                        endRowIndex: i + 1,
                        startColumnIndex: 0,
                        endColumnIndex: 3,
                    },
                    cell: {
                        userEnteredFormat: {
                            backgroundColor: isEvenRow
                                ? { red: 0.95, green: 0.95, blue: 0.98 }  // Light lavender
                                : { red: 1, green: 1, blue: 1 },          // White
                            verticalAlignment: 'MIDDLE',
                        },
                    },
                    fields: 'userEnteredFormat(backgroundColor,verticalAlignment)',
                },
            });
        }

        // Add borders around all data
        formatRequests.push({
            updateBorders: {
                range: {
                    sheetId: firstSheetId,
                    startRowIndex: 0,
                    endRowIndex: totalRows,
                    startColumnIndex: 0,
                    endColumnIndex: 3,
                },
                top: { style: 'SOLID', color: { red: 0.8, green: 0.8, blue: 0.8 } },
                bottom: { style: 'SOLID', color: { red: 0.8, green: 0.8, blue: 0.8 } },
                left: { style: 'SOLID', color: { red: 0.8, green: 0.8, blue: 0.8 } },
                right: { style: 'SOLID', color: { red: 0.8, green: 0.8, blue: 0.8 } },
                innerHorizontal: { style: 'SOLID', color: { red: 0.9, green: 0.9, blue: 0.9 } },
                innerVertical: { style: 'SOLID', color: { red: 0.9, green: 0.9, blue: 0.9 } },
            },
        });

        // Center align Date and Observer Link columns for all rows
        formatRequests.push(
            {
                repeatCell: {
                    range: {
                        sheetId: firstSheetId,
                        startRowIndex: 1,
                        endRowIndex: totalRows,
                        startColumnIndex: 0,
                        endColumnIndex: 1,
                    },
                    cell: {
                        userEnteredFormat: { horizontalAlignment: 'CENTER' },
                    },
                    fields: 'userEnteredFormat.horizontalAlignment',
                },
            },
            {
                repeatCell: {
                    range: {
                        sheetId: firstSheetId,
                        startRowIndex: 1,
                        endRowIndex: totalRows,
                        startColumnIndex: 2,
                        endColumnIndex: 3,
                    },
                    cell: {
                        userEnteredFormat: { horizontalAlignment: 'CENTER' },
                    },
                    fields: 'userEnteredFormat.horizontalAlignment',
                },
            }
        );

        // Set row heights for data rows
        formatRequests.push({
            updateDimensionProperties: {
                range: {
                    sheetId: firstSheetId,
                    dimension: 'ROWS',
                    startIndex: 1,
                    endIndex: totalRows,
                },
                properties: { pixelSize: 32 },
                fields: 'pixelSize',
            },
        });

        // Apply all formatting
        if (formatRequests.length > 0) {
            await sheets.spreadsheets.batchUpdate({
                spreadsheetId: targetSheetId,
                requestBody: {
                    requests: formatRequests,
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
