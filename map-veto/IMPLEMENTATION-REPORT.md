# Veto implementation and verification

Completed the requested checklist points 1, 2, 4, 5, 6, 7, 8 and 9.

| Point | Implemented behavior |
| --- | --- |
| 1 | Atomic check-in, exact timestamps, duplicate protection, both-ready notification and start gate. |
| 2 | Only authorized match admins trigger the coin toss; teams wait after check-in. Higher seed or coin winner chooses Team A/B; role mapping, winner and confirmation are logged. |
| 4 | Server-enforced 60-second action deadlines, warning at 15 seconds or below, random map/side fallback and stale-request rejection. |
| 5 | Team A/B choice has its own 60-second deadline, confirmation and random fallback. |
| 6 | Ordered timestamped history, confirmation times, timeout/random metadata, deciders, referee reasons, copy and text download. Undo/reset preserve prior history. |
| 7 | Authorized pause/resume, restart clock, reopen last selection, correction, forced map/side and full reset. Pauses preserve remaining time. |
| 8 | Live observer/referee view is read-only; changes require scoped referee controls. API and database permissions enforce this. |
| 9 | Opponent check-in, both ready, veto start, each team turn, countdown warning, confirmed random action, pause/resume and completion notices. |

Removed Framer Motion and its dependencies, animated coin assets, gradients, blur effects, shadows, decorative animations and default downloaded fonts. Simplified the landing page, map cards, timeline, dialogs and admin surfaces. Retained map images and event branding. No before/after timing benchmark was recorded, so no numerical speedup is claimed.

## Supabase

Migrations 016–027 are applied using verified TLS. The public CA certificate is in `scripts/supabase-ca.crt`; the connection string remains in ignored `.env.local`.

`map-veto-timeouts` runs every five seconds. New sessions opt into automatic deadlines when both teams check in. Existing abandoned sessions are not automatically advanced. Each action rejects late manual submissions at 60 seconds; the scheduled fallback runs on the next worker tick. Connected clients also request the authoritative fallback when the clock expires.

Database changes are live. Website changes are committed locally; this work did not publish or deploy the frontend.

## Validation

- Production webpack build: passed, including TypeScript and all generated routes.
- Local PostgreSQL integration tests: passed.
- Remote PostgreSQL integration tests: passed inside a rolled-back transaction.
- BO1, BO3 and BO5 completion, swapped roles, random bans/picks/sides and deciders: passed.
- Notification transition tests: passed.
- HTTP integration: passed, including concurrent readiness, observer restrictions, direct RPC restrictions and a complete BO3.
- Actual Supabase scheduled worker with a disconnected QA match: passed.
- Browser: team check-in, role confirmation, keyboard map selection, completion, referee force while paused, countdown warning and 390px layout checked.
- Full repository ESLint: passed with zero errors after fixing the 30 legacy errors in seven files. Non-blocking warnings remain.

Tests create labeled fixtures. HTTP/scheduler tests delete their fixtures; remote transactional tests roll back. Browser fixtures are cleaned up separately.

## Running the tests

Run from `map-veto` with Node 22.23 or newer:

```text
npm test
npm run test:remote
npm run test:http
npm run test:scheduler
```

Remote tests require the existing Supabase environment variables, `SUPABASE_DB_URL` and the CA certificate. HTTP tests require the app at `http://localhost:3000`; override with `TEST_APP_URL` if needed.

For browser testing, `node tests/http.test.mjs --keep` retains a labeled match and writes ignored `.qa-session.json`. `node scripts/qa-control.mjs cleanup` deletes that exact QA match. The helper also supports reset, ready-a, ready-b, coin, position, warning, pause, resume, restart, undo and complete.

## Feature commits

`61a1de1` readiness; `09fd920` role selection; `8bc1ebb` move timer; `b3e631b` role-choice timer; `a3879ba` audit; `cafe299` referee overrides; `8130511` observers; `bbb455b` notifications; `17614d5` background timeouts; `7855004` stale selection and format verification. Final commits add the flat UI, audit-order correction and reproducible test tooling.

Admin-only coin toss correction: UI hides all toss controls from teams/observers; HTTP and PostgreSQL reject their random and forced toss requests. Local/remote database tests, HTTP integration, targeted ESLint, TypeScript and browser verification passed.

## Team-requested timeouts

A timeout is a team incident report for the referee. Both teams have a Request timeout button and a required explanation (up to 1000 characters). One open request is allowed per team; retries reuse the request ID and do not duplicate the audit.

Referees receive a live notification and an open-request count. Open Referee controls → Timeouts, or the match activity Timeouts tab, to review the report and enter a required resolution note. The floating referee tab remains accessible during check-in, coin toss and role-choice dialogs. Teams can see the resolved report and receive its resolution notice.

Requesting or resolving an incident does not pause, resume or restart the clock. The referee makes those decisions separately. The audit records the requesting team, explanation, timestamps, resolving admin and resolution. Move-clock expiration is labeled separately as “move timer expired: random selection.”

Migration 026 provides service-only functions and a protected request table. Local and remote database tests cover permissions, expired/cross-match links, idempotence, duplicate open requests, immutable resolution and preserved clocks/pauses. HTTP tests exercise report delivery and protected resolution. Production build and targeted ESLint passed.
Browser verification passed: a team submitted its explanation, the already-open referee Timeouts tab received it without reload, the referee resolved it, and both tabs showed the request and resolution in the audit. The labeled QA match was deleted afterward.

## Lint cleanup

The 30 legacy lint errors were fixed without disabling rules: typed public API/log data and form choices, derived simulation state, conditional route/event state adjustments and a cancellable export initialization request. Repository-wide ESLint reports zero errors; 40 existing non-blocking warnings remain.
Lint-cleanup verification: production webpack build and TypeScript passed, notification/PostgreSQL regression suites passed, and HTTP tests passed against the production build, including ordered public veto actions, completed-match discovery and rendered public logs. Test fixtures were deleted.

## Bulk match creation

Open an event's Matches dashboard and choose Bulk create. Upload a comma-separated TXT or CSV file with the four columns `Match Number, Team A, Team B, Higher Seed (A/B) or Coin Flip (C)`. The provided header is optional; quoted names may contain commas. Preview and validation happen before creation. Each file supports up to 500 matches and 1 MB, with unique positive match numbers within that file. Choose one BO1/BO3/BO5 format for the file; imported matches use the competitive seven-map pool.

A and B identify the higher-seeded real team, which chooses Team A/B when both teams check in. C automatically tosses when the second team checks in, and the winner chooses Team A/B. This supersedes the earlier manual-trigger rule for bulk C imports. Individual matches retain their existing referee-triggered toss. Concurrent readiness and retries cannot toss twice. The audit marks automatic tosses.

Migration 027 creates protected import metadata, per-match batch/number/automatic-toss fields, and a service-only atomic import function. Owners and event admins can import. Each transaction creates the entire batch, match state, four magic links, and event roster entries; failures leave no partial batch. Retrying the same request does not duplicate matches. Separate imports can share a filename and have distinct IDs and timestamps.

The Bulk creation file filter appears when an event is selected. It filters the database query before pagination, and the imported file is selected automatically after creation. Match numbers and source filenames appear in the rows. Live insert notifications are coalesced, and stale fetches cannot overwrite newer filter/page results. The Links button uses the authorized match API to retrieve all four links.

Validation: parser tests, local and rolled-back remote PostgreSQL tests, authenticated HTTP tests against Supabase, production build/TypeScript and ESLint passed. HTTP coverage includes owner/admin/outsider access, malformed/oversized uploads, atomicity, retry protection, private batch listings, concurrent automatic C tosses, A/B entitlement, seven-map initialization, four links, same-name imports and a 25-match filtered second page. Browser checks cover invalid-file feedback, preview, actual import, automatic batch selection, links and pagination. Temporary QA accounts, events and matches are removed after testing.

Run `npm run test:bulk-http` against a local app at port 3001 (or set `TEST_APP_URL`). `node tests/bulk-http.test.mjs --keep` retains disposable browser fixtures in ignored `.qa-bulk-session.json`; `node tests/bulk-http.test.mjs --cleanup` removes those exact fixtures.

## Dashboard link copying

The legacy dashboard read tokens directly through authenticated table access. Protected link-table policies could return no rows, leaving four empty strings; copying an empty string still resolved successfully and showed “copied.” Bulk creation switched this retrieval to the authorized match API. The dashboard now additionally requires four valid tokens before opening the links dialog, so missing links produce an explicit error.

Dashboard and create-match copying share a small helper that refuses empty content, tries the native Clipboard API, and falls back to selection copying if native access is unavailable or denied. The fallback must return success; a failure displays a manual-copy instruction instead of a false success message. Temporary selection elements are removed and prior focus is restored.

Validation: targeted clipboard tests cover complete URLs, missing/empty links, exact written contents, unavailable/denied native API access, fallback failure and cleanup. The production build, TypeScript, targeted ESLint (zero errors), existing local regression suites and authenticated bulk HTTP tests passed. In the browser, all four dashboard Copy buttons were clicked and the actual clipboard was read and compared against the displayed URL; every comparison matched. Disposable QA accounts, event and matches were removed.

## Final-15-second ticking warning

The one-off 15-second warning toast is replaced with a short synthesized tick/tock once per remaining second from 15 through 1. The final five ticks are slightly stronger. The visible countdown and “Time is running out” text remain. The same timer supplies role-choice and veto-turn warnings. No downloaded audio, dependency, additional network request or server timer is added.

Audio is unlocked by user interaction, respecting browser autoplay restrictions. Duplicate state refreshes cannot play a tick twice for the same clock/second. Pausing, ending/changing the turn and unmounting stop active voices; audio contexts and gesture listeners are cleaned up on unmount. Suspended audio does not accumulate delayed ticks. Targeted audio tests cover thresholds, deduplication, urgency, gesture unlocking, stopped voices and disposal; notification regressions, targeted lint and production build/TypeScript are checked before commit.
