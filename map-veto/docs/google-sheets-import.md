# Google Sheets match imports

Open Events → Sheet matches. Connect a workbook URL, choose a day tab, check the desired matches, choose A/B/C, and confirm. Ready pairings create vetoes immediately; approved unresolved pairings create later. Unchecked pairings stay excluded until another confirmation selects them.

Connecting a workbook or opening a day never creates matches. The preview shows each row's permanent ID, round, teams, format, password status, A/B/C choice and import status, with counts of rows ready to create, approved fixtures waiting for opponents, blocked or conflicting rows, already imported, skipped and unselected rows. **Confirm selected matches** re-reads the workbook; if anything changed since the preview, nothing is written, the preview refreshes in place, changed rows are marked “Changed since review”, existing checks are kept for rows that can still be created and new rows stay unchecked. After confirmation the page lists each selected ID as created, already imported, waiting, needing review or deleted. Background sync only creates fixtures approved in an earlier confirmation.

A workbook entered when creating or editing an event is connected automatically. The Sheet matches page loads its day tabs without requiring the URL again. Migration 037 carries over saved event sheet IDs and preserves existing import connections and approvals. Entering a URL is normalized to its spreadsheet ID. Linking alone does not approve or create matches.

## Workbook contract

- Day tabs use names such as `D1 - Matches`.
- A header row contains `Names`, `Status`, `MapVETO Match ID`, and `Format`.
- Each match occupies two consecutive team rows. Round labels appear before Status and carry through their section; merged cells are supported.
- Put a permanent ID (letters, numbers, dots, underscores, hyphens; up to 100 characters) on the first team row. IDs must be unique across the entire workbook and must never be reused for another fixture. Move the ID with its two rows when rearranging fixtures.
- Put `BO1`, `BO3`, or `BO5` on the first team row. A matching value on the second row is allowed.
- Blank opponents, winner/loser placeholders, TBD/TBA and formula errors wait. Started/ended/forfeit/cancelled fixtures and byes are skipped.
- Optional `Password` column: when present, every fixture on that day tab needs a password on each team's row, used for that team's link. Format the column as plain text so leading zeros survive. Passwords are case-sensitive, 1–128 characters, and are never trimmed or altered; surrounding spaces, control characters and missing values block the row in the preview.
- Google Sheets remains responsible for tournament results and bracket progression. Its calculated Names cells must only resolve to actual participants when the upstream results are final. Veto completion does not decide the tournament winner.

The experiment workbook has 36 IDs, D1-M01 through D7-M01 as appropriate. Days 1–6 are BO3; Day 7 is BO5. Existing formulas remain in place.

## Team passwords

Both team links of a match imported with a password require that password before the website returns any match data or accepts any team action. The link and the password are both required. Head Admin, Referee and Observer links are unchanged.

- The server enforces this on the match page, the session snapshot and every team action (check-in, Team A/B choice, bans/picks/sides, timer expiry, timeout requests and reset answers). A locked team page opens no realtime subscription. Match broadcasts carry no data; clients re-read the access-checked snapshot.
- A correct password issues an HttpOnly cookie for that team link of that match only, valid for four hours. Refreshing and other tabs reuse it; another match or the opposing team link is not unlocked.
- Five attempts per team link per ten minutes, including parallel requests. A successful attempt clears the counter.
- Only salted scrypt hashes are stored, in a service-only table separate from the publicly readable match row. Sheet snapshots keep a keyed fingerprint for change detection. Plaintext never reaches SQL, logs, responses or exports; previews show only `Password supplied`, `Password missing` or `Password invalid`.
- Sync never replaces an active password. A changed sheet password shows a conflict with **Approve new password** for Head Admins. Approval re-reads the sheet, activates the new hash and signs out both teams. A removed password keeps the current one active. Linking an existing manual match does not adopt the sheet password until a Head Admin approves it.
- Use a private workbook shared with the service account for real passwords. When the app reads through public link access the preview warns that anyone with the link can read them. Use dummy passwords in the public experiment workbook.

Match privacy: a veto is private until it is complete. Before completion only the match creator, the event owner and event Head Admins/Referees can read it directly; teams use their password-checked links and observers their private links. `/api/matches/public`, `/api/matches/:id/public`, `GET /api/matches/:id`, the public log page and anonymous table reads (migration 040) only return completed matches. A veto reopened by a Head Admin is private again until it completes.

## Access and deployment

Public workbooks can be read without Google credentials. For private workbooks set `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `GOOGLE_PRIVATE_KEY` and share Viewer access with that service-account address. Enable the Google Sheets API for its project. The integration never writes match links or tokens to the workbook.

Apply migrations 034–036 using `scripts/migrate.mjs`. Apply migrations 038–040 before deploying this code: team routes fail closed (503) until 038's tables exist. Migrations 038–040 were applied to the production project on 14 October 2026. They add service-only connection/source/worker tables, an atomic import function, and the `map-veto-sheet-sync` Supabase cron job. The job runs each minute and dispatches an authenticated HTTP request with a generated secret stored in a service-only table. Referees can read previews and history; only event owners/Head Admins can connect, approve, stop, sync or link existing matches.

On a production connection/confirmation, the app configures the worker endpoint using `VERCEL_PROJECT_PRODUCTION_URL`, or `NEXT_PUBLIC_APP_URL` when hosting elsewhere. Set the latter to the canonical HTTPS **map-veto app** origin if needed. Configure the deployment environment with the usual Supabase server credentials and optional Google credentials. Local testing uses Sync now or an authenticated worker test: localhost cannot be reached by Supabase's cron job. A worker endpoint is not configured from request headers or user-provided URLs.

Only approved day tabs are fetched; players make no Google requests. The worker claims at most two events per call with leases, fetches bounded ranges, and records failures for the organizer. Slow/failed Google requests retry on later minute runs. Stop a completed day's automatic sync to stop its reads.

## Integrity

The unique `(event_id, spreadsheet_id, source_id)` constraint plus an event transaction lock prevents duplicate creation across retries and concurrent workers. Match state, links and source history commit together. Source history survives veto deletion, blocking accidental recreation. Reconnecting the same sheet preserves history; switching workbooks on an existing connection is blocked.

Changed participants or format flag a conflict without altering existing vetoes. Missing IDs/rows do not delete vetoes. A matching manually created veto blocks automatic duplication and can be linked explicitly in the preview if its format and team order agree. Confirmations re-read the sheet and reject stale previews.

The competitive map list has one application source: `src/lib/maps/pools.ts`. Sheet imports, manual creation, bulk creation and map-management UI use it. Imported vetoes retain their creation-time pool; later system changes apply to later matches.

## Verification

`node tests/sheets.test.mjs` runs parser cases locally.

With a local production server on port 3001, `node tests/sheets-http.test.mjs --keep` creates disposable users/event against the public experiment workbook. `node tests/sheets-tabs.test.mjs` checks all real day layouts; `node tests/sheets-db.test.mjs` checks format/seed modes, races, rollback, moved IDs, conflicts, deletion tombstones and manual linking. The resolution test requires temporarily setting D1 G9 to `Codex Sheet QA Winner`; restore its original `='Bracket View'!K9` formula afterwards. Run `node tests/sheets-http.test.mjs --cleanup` to remove the fixture. Never print or commit the ignored session file.

## Sync test matrix — 14 October 2026

Run against a disposable local stack (PostgreSQL 18 with migrations 016–039, PostgREST, production build) using the public experiment workbook read-only, plus PGlite database tests in `npm test`. No workbook values or formulas were edited, and only local disposable fixtures were created. Dummy passwords only.

| Scenario | Result | Evidence |
| --- | --- | --- |
| Open/connect workbook without confirmation | Pass: 0 matches, 0 import rows after opening all 7 days | local HTTP + DB query |
| Confirm a subset of ready matches | Pass: 2 checked ready created, 1 checked waiting approved, 8 unchecked excluded | browser |
| Confirm unresolved fixture, then it resolves | Pass: created exactly once, with password | `npm test` (sheet passwords) |
| Repeated Sync now, worker retries, concurrent confirmation | Pass: 3 concurrent syncs, 2×2 concurrent worker calls, 2 concurrent confirms; no duplicates | local HTTP + DB query |
| Multiple rounds on the same day | Pass: Round 1/2 rows keep distinct IDs | real workbook D1, parser tests |
| Moved rows / changed day order | Pass: same ID stays associated | parser tests; remote `sheets-db` case |
| Teams, format or password changed after import | Pass: conflict shown, existing match unchanged; password needs Head Admin approval | `npm test` |
| Missing/duplicate ID, invalid format, conflicting password cells | Pass: row blocked with a clear issue | parser tests |
| Blank/TBD opponents, byes, cancelled/started fixtures | Pass: wait or skip | parser tests, real workbook |
| Delete an imported veto, then sync | Pass: tombstoned as deleted, not recreated | local HTTP + DB query |
| Google access revoked / unreadable, then restored | Pass: worker reports failure, `last_error` shown, next run recovers with no duplicates; bad worker secret 401 | local worker endpoint |
| Stale preview at confirmation | Pass: nothing written, preview refreshed, selection and A/B/C kept | browser |
| Private workbook through a Viewer service account | **Not run**: no service-account credentials available locally | — |
| Deployed background worker (Supabase cron → production URL) | **Not run**: nothing was deployed; the worker endpoint was exercised directly | — |
| Real opponent resolution in the workbook (`sheets-resolution`) | **Not run**: requires editing the shared workbook | — |

Before release, run against the real project: `npm run test:remote`, `npm run test:sheets-http`, `node tests/sheets-db.test.mjs`, `node tests/sheets-resolution.test.mjs` (with the documented D1 G9 edit and restore), `npm run test:password-http`, and a private workbook shared with the service account containing dummy passwords.

### Production project run — 14 October 2026

Migrations 038–040 applied to the hosted project in one transaction. With the app built locally against that project, these passed: `http`, `team-password-http`, `match-privacy-http`, `timer-http` (Realtime broadcasts), `staff-timeouts-http`, `bulk-http`, `sheets-http`, `sheets-tabs` and `sheets-db`. All disposable users, events and matches were removed afterwards. Still not run: `test:remote` (needs the database password for `SUPABASE_DB_URL`), a private service-account workbook, `sheets-resolution` (edits the shared workbook), and the cron worker against the deployed URL, which runs after the production deploy.

