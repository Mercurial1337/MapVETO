# Veto implementation and verification

Completed the requested checklist points 1, 2, 4, 5, 6, 7, 8 and 9.

| Point | Implemented behavior |
| --- | --- |
| 1 | Atomic check-in, exact timestamps, duplicate protection, both-ready notification and start gate. |
| 2 | Higher seed or coin winner chooses Team A/B; role mapping, winner and confirmation are logged. |
| 4 | Server-enforced 60-second action deadlines, warning at 15 seconds or below, random map/side fallback and stale-request rejection. |
| 5 | Team A/B choice has its own 60-second deadline, confirmation and random fallback. |
| 6 | Ordered timestamped history, confirmation times, timeout/random metadata, deciders, referee reasons, copy and text download. Undo/reset preserve prior history. |
| 7 | Authorized pause/resume, restart clock, reopen last selection, correction, forced map/side and full reset. Pauses preserve remaining time. |
| 8 | Live observer/referee view is read-only; changes require scoped referee controls. API and database permissions enforce this. |
| 9 | Opponent check-in, both ready, veto start, each team turn, countdown warning, confirmed random action, pause/resume and completion notices. |

Removed Framer Motion and its dependencies, animated coin assets, gradients, blur effects, shadows, decorative animations and default downloaded fonts. Simplified the landing page, map cards, timeline, dialogs and admin surfaces. Retained map images and event branding. No before/after timing benchmark was recorded, so no numerical speedup is claimed.

## Supabase

Migrations 016–024 are applied using verified TLS. The public CA certificate is in `scripts/supabase-ca.crt`; the connection string remains in ignored `.env.local`.

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
- Full repository ESLint: 30 pre-existing errors remain in seven legacy files. Each affected file was compared with starting revision `1bd5811`; its error count and rule set are unchanged. Core veto implementation has no ESLint errors.

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
