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

## Access status when prepared

On 15 October 2026, the connected Supabase integration could inspect the existing
organization/database, but its required `get_cost` project-creation operation was
unavailable. The owner approved creating the new database in
`Mercurial1337's Org` (`faesmjyychewvorsaqrx`) and was asked to create it through
the dashboard. The old database had 4 events and 141 matches at inspection time;
no records were changed.

The separate Vercel project `vgveto` was created successfully:
`prj_jyPRVmLgEbBZ4kMmnXOT820Qjwu1`. It belongs to the same team as `mapveto`:
`team_JlhAyaA2xvtyhNjHwFJDFjQ6`. The root directory is `map-veto`, framework is
Next.js, and the two public routing variables above are configured. It has not
been deployed or connected to Git, a database, or a domain yet.

Explicit team-scoped Vercel requests returned HTTP 403, but project operations
using the connection's default scope worked. Billing reads remain blocked, so
the team's current Pro/Hobby status was not independently verified. Projects
in the same team use that team's plan and shared usage billing.

Routing regression tests, targeted lint, and the production build passed. This
is preparation for the cutover, not a completed deployment.
