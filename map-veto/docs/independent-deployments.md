# EMEA Clash archive and independent VG Veto deployment

## Intended result

Keep the existing Vercel `mapveto` project and Supabase project
`wxlrbiwysksiwfpfqkef` for EMEA Clash. Its records and domains remain in place.
Create a second Vercel project and a second Supabase project for `vgveto.com`.
They may use the same repository, but must use different Supabase credentials.
No workspace columns or per-request tenant queries are needed.

## New deployment configuration

Set these values only on the new Vercel project:

```dotenv
APP_ROUTING_MODE=standalone
NEXT_PUBLIC_APP_URL=https://vgveto.com
NEXT_PUBLIC_SUPABASE_URL=<new project API URL>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<new project publishable or anon key>
SUPABASE_SERVICE_ROLE_KEY=<new project server-only service key>
```

Keep `APP_ROUTING_MODE` unset on the EMEA project. That preserves its root
landing page and `mapveto.emeaclash.com` routing. Standalone mode serves the
login/app directly at the new domain, including Vercel preview URLs, without
redirecting to EMEA Clash or adding authentication refresh calls to player links.

Use `map-veto` as the new Vercel project's repository root, matching this repo's
Next.js app. Set the new Supabase Auth Site URL to `https://vgveto.com` and allow
only the callback URLs needed by this deployment. Do not reuse the EMEA database
URL, service key, signed team sessions, or sheet worker secret.

## Database preparation

- Preserve the existing project as the accessible archive. Before any later
  retirement, make a tested database backup and separately preserve uploaded
  storage files; a database backup alone does not contain file contents.
- Install the current application schema, functions, triggers, RLS policies,
  indexes and scheduled jobs in the new database. Generate new deployment secrets
  and leave sheet workers unconfigured until pointed at the new app.
- Copy only the reference data: games, maps, map pools, pool membership and veto
  templates. Do not copy events, tournaments, matches, magic links, logs, bulk
  batches, sheet connections/approvals, timeout/reset requests or match passwords.
- Carry over only `mo@vcl.com` and explicitly approved synthetic test accounts.
  Do not copy the full Auth database. Preserve supported password hashes through
  the provider's migration method, or use an owner-controlled password reset;
  never invent or publish a password.
- Recreate storage buckets/policies if the application needs uploads. Copy a
  reference image only when required; do not leave new map records depending on
  disposable EMEA event uploads.

**Do not run `supabase/schema.sql` against the EMEA database.** It contains reset
statements. The repository's base schema also overlaps some historical migrations;
blindly running every file in alphabetical order is not a verified fresh install.
Validate the new schema against the current live schema before using it.

## Cutover and verification

1. Test the new instance on its Vercel preview URL, with its own credentials.
2. Confirm zero tournament records and only the approved accounts.
3. Check login, match creation, all five role links, password unlock/map hydration,
   ready check, timer/automation, staff overrides and timeout notifications.
4. Test Google Sheets preview/confirmation and background sync using a disposable
   event. Check that callbacks/worker traffic target the new deployment.
5. Confirm old match tokens do not work against the new database, and new test
   data does not appear on EMEA Clash.
6. Attach `vgveto.com` (and optionally redirect `www` to the apex) to the verified
   new deployment. Leave EMEA domains attached to the old project.
7. Remove disposable new-instance fixtures and record both project IDs and the
   deployed commit. Never commit credentials or backups.

## Provisioning record — 15 October 2026

| Resource | EMEA Clash | VG Veto |
| --- | --- | --- |
| Vercel project | `mapveto` / `prj_Il5a4WXAwuDhaDBcCWbr5dgMjz5J` | `vgveto` / `prj_jyPRVmLgEbBZ4kMmnXOT820Qjwu1` |
| Supabase project | `wxlrbiwysksiwfpfqkef` | `rmertbxmgsnxkqvdhbii` |
| Supabase region | London (`eu-west-2`) | Ireland (`eu-west-1`, owner's Europe selection) |
| Runtime | Existing configuration | Fluid, Dublin (`dub1`) |
| Records after test cleanup | 4 events, 141 matches | 0 events, matches, logs, sheet connections and uploaded objects |
| Accounts carried over | Existing accounts retained | `mo@vcl.com` only |

The owner created VG Veto in `Mercurial1337's Org`
(`faesmjyychewvorsaqrx`). The new database has all 23 RLS-protected application
tables through migration 040, separate random worker/access secrets, explicit
Data API grants, the timeout/sheet cron jobs, and an empty `event-assets` bucket
with user-owned upload permissions. Reference data copied: 1 game, 12 maps,
1 pool, 7 pool memberships, 3 templates. The main account's password hash and
email identity were migrated; no sessions, other accounts, or tournament records
were copied. Temporary test users were deleted.

`scripts/fresh-database.mjs` assembles a guarded, seed-free installation from the
existing schema/migrations. It refuses an existing public schema and omits the
destructive reset header. `node tests/fresh-database.test.mjs` verifies the full
install, grants, RLS, empty records and reinstallation refusal locally.

Both Vercel projects belong to team `team_JlhAyaA2xvtyhNjHwFJDFjQ6`. The new
project's Production environment has independent Supabase credentials and the
routing variables above. Secret values are not in this document or Git. Billing
reads are blocked by the connection, so the team's current Pro/Hobby status was
not independently verified. Projects in that team use its plan and shared usage.

Source commit `a569163fef54d0df68f433a5a4fd4a75675699e2` was pushed to
`codex/vgveto-standalone`; the remote EMEA `main` branch was left unchanged.
The Git deployment failed with `git_info_fail`. A direct source deployment was
then completed as `dpl_9yEVNDCFkYdVUEKMNkhSRuyCu3oq`. After attaching the
custom domain, production was rebuilt as `dpl_F5wKxVZLrWMpxRyxmaGQannTEvza`
and reached **READY** with no alias errors. This refreshed the system production
URL used by sheet workers. `https://vgveto.com` serves the login over verified
HTTPS; `www.vgveto.com` is verified and redirects to the apex with HTTP 308.
Source files and assets were uploaded without credentials. The project is not connected for
automatic Git deployments; pushing a branch alone does not deploy VG Veto yet.

An initial production approval review flagged the existing public-results and
permanent-delete routes. Code inspection and real HTTP checks established that
only completed vetoes are public and deletion requires match-admin access. The
deployment request subsequently passed review. No route permissions were relaxed.

Passed against the new database using the local production build:

- `tests/match-privacy-http.test.mjs`: public APIs/listings/table reads hide live
  vetoes; completed results become public.
- `tests/http.test.mjs`: unauthorized link access/deletion/overrides denied;
  readiness, full BO3, timeouts, acknowledgment/resolution, reopen and audit work.
- `tests/team-password-http.test.mjs`: gated reads/actions, scoped sessions,
  rate limits, password replacement and map hydration for both teams work.
- `tests/bulk-http.test.mjs`: authenticated imports, batch filtering, A/B/C flow,
  referee restrictions/reset approvals, and staff completion notifications work.
- Standalone/legacy routing regression test, targeted lint and production build.

The password/map-hydration and bulk/staff-role suites also passed through the
live `https://vgveto.com` domain. The live Sheets suite passed real day-tab reads,
selected-only creation, concurrent retry deduplication, password-aware team
check-in, role restrictions and authenticated worker execution. Its test fixture
uses a known temporary password on its disposable imported match, rather than
assuming the public experiment workbook has no passwords. The test also asserts
that background sync uses the public production origin; the saved endpoint is
`https://vgveto.com/api/sheets/worker`.

All disposable fixtures were removed. Signed-out `/admin` returns a redirect to
login, and the public match list returned HTTP 200 with zero matches at release.

## Managing the instances

- Tournament operations: `https://vgveto.com/admin` after domain activation.
  Sign in with `mo@vcl.com` and its existing password.
- Hosting, deployments, logs, domains and project usage:
  `https://vercel.com/mohameds-projects-f7bd3723/vgveto`.
- Database, Auth users, query logs, storage and database usage:
  `https://supabase.com/dashboard/project/rmertbxmgsnxkqvdhbii`.
- Old records: keep using EMEA Clash's original site/projects. Never run a new
  instance's cleanup/reset command against the archive.

For future automatic releases, connect `Mercurial1337/MapVETO` under the new
Vercel project's Git settings and deliberately choose its production branch.
Until then, release VG Veto explicitly through its project; do not assume a push
to EMEA's `main` updates it. Never copy credentials between the two projects.

The original ignored `.env.local` still targets EMEA. New-instance credentials
are in the separate ignored `.env.vgveto.local`. Select the intended environment
explicitly before building or testing; Next.js embeds public Supabase settings
at build time, so switching server runtime variables alone is insufficient.

Supabase Auth's Site URL/redirect settings should be set to `https://vgveto.com`
in the new project before introducing password-reset or email-link flows. The
current login uses email/password; copied accounts do not need an email link.
