# Google Sheets match imports

Open Events → Sheet matches. Connect a workbook URL, choose a day tab, check the desired matches, choose A/B/C, and confirm. Ready pairings create vetoes immediately; approved unresolved pairings create later. Unchecked pairings stay excluded until another confirmation selects them.

A workbook entered when creating or editing an event is connected automatically. The Sheet matches page loads its day tabs without requiring the URL again. Migration 037 carries over saved event sheet IDs and preserves existing import connections and approvals. Entering a URL is normalized to its spreadsheet ID. Linking alone does not approve or create matches.

## Workbook contract

- Day tabs use names such as `D1 - Matches`.
- A header row contains `Names`, `Status`, `MapVETO Match ID`, and `Format`.
- Each match occupies two consecutive team rows. Round labels appear before Status and carry through their section; merged cells are supported.
- Put a permanent ID (letters, numbers, dots, underscores, hyphens; up to 100 characters) on the first team row. IDs must be unique across the entire workbook and must never be reused for another fixture. Move the ID with its two rows when rearranging fixtures.
- Put `BO1`, `BO3`, or `BO5` on the first team row. A matching value on the second row is allowed.
- Blank opponents, winner/loser placeholders, TBD/TBA and formula errors wait. Started/ended/forfeit/cancelled fixtures and byes are skipped.
- Google Sheets remains responsible for tournament results and bracket progression. Its calculated Names cells must only resolve to actual participants when the upstream results are final. Veto completion does not decide the tournament winner.

The experiment workbook has 36 IDs, D1-M01 through D7-M01 as appropriate. Days 1–6 are BO3; Day 7 is BO5. Existing formulas remain in place.

## Access and deployment

Public workbooks can be read without Google credentials. For private workbooks set `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `GOOGLE_PRIVATE_KEY` and share Viewer access with that service-account address. Enable the Google Sheets API for its project. The integration never writes match links or tokens to the workbook.

Apply migrations 034–036 using `scripts/migrate.mjs`. They add service-only connection/source/worker tables, an atomic import function, and the `map-veto-sheet-sync` Supabase cron job. The job runs each minute and dispatches an authenticated HTTP request with a generated secret stored in a service-only table. Referees can read previews and history; only event owners/Head Admins can connect, approve, stop, sync or link existing matches.

On a production connection/confirmation, the app configures the worker endpoint using `VERCEL_PROJECT_PRODUCTION_URL`, or `NEXT_PUBLIC_APP_URL` when hosting elsewhere. Set the latter to the canonical HTTPS **map-veto app** origin if needed. Configure the deployment environment with the usual Supabase server credentials and optional Google credentials. Local testing uses Sync now or an authenticated worker test: localhost cannot be reached by Supabase's cron job. A worker endpoint is not configured from request headers or user-provided URLs.

Only approved day tabs are fetched; players make no Google requests. The worker claims at most two events per call with leases, fetches bounded ranges, and records failures for the organizer. Slow/failed Google requests retry on later minute runs. Stop a completed day's automatic sync to stop its reads.

## Integrity

The unique `(event_id, spreadsheet_id, source_id)` constraint plus an event transaction lock prevents duplicate creation across retries and concurrent workers. Match state, links and source history commit together. Source history survives veto deletion, blocking accidental recreation. Reconnecting the same sheet preserves history; switching workbooks on an existing connection is blocked.

Changed participants or format flag a conflict without altering existing vetoes. Missing IDs/rows do not delete vetoes. A matching manually created veto blocks automatic duplication and can be linked explicitly in the preview if its format and team order agree. Confirmations re-read the sheet and reject stale previews.

The competitive map list has one application source: `src/lib/maps/pools.ts`. Sheet imports, manual creation, bulk creation and map-management UI use it. Imported vetoes retain their creation-time pool; later system changes apply to later matches.

## Verification

`node tests/sheets.test.mjs` runs parser cases locally.

With a local production server on port 3001, `node tests/sheets-http.test.mjs --keep` creates disposable users/event against the public experiment workbook. `node tests/sheets-tabs.test.mjs` checks all real day layouts; `node tests/sheets-db.test.mjs` checks format/seed modes, races, rollback, moved IDs, conflicts, deletion tombstones and manual linking. The resolution test requires temporarily setting D1 G9 to `Codex Sheet QA Winner`; restore its original `='Bracket View'!K9` formula afterwards. Run `node tests/sheets-http.test.mjs --cleanup` to remove the fixture. Never print or commit the ignored session file.
