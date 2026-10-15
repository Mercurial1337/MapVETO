# VG Veto performance monitoring

## Where to look

| Question | Dashboard |
| --- | --- |
| Do pages feel fast to real visitors? | [Vercel Speed Insights](https://vercel.com/mohameds-projects-f7bd3723/vgveto/speed-insights) |
| Which API paths are slow or returning errors? | [Vercel Observability](https://vercel.com/mohameds-projects-f7bd3723/vgveto/observability) |
| What failed during a request? | [Vercel runtime logs](https://vercel.com/mohameds-projects-f7bd3723/vgveto/logs) |
| How much CPU, memory, bandwidth and invocation allowance have we used? | [Vercel team usage](https://vercel.com/mohameds-projects-f7bd3723/~/usage) — filter to VG Veto |
| Is the database under pressure? | [Supabase project](https://supabase.com/dashboard/project/rmertbxmgsnxkqvdhbii) → Reports → Database, API and Realtime |
| Which queries cost most? | Supabase → Database → Query Performance / Query Insights |
| Are there avoidable database problems? | Supabase → Advisors → Performance |

## Installed tracking

`@vercel/speed-insights` 2.0.0 runs only for standalone Vercel production builds.
It uses asynchronous browser measurement and samples 10% of visits. It does not
add a timer, database table, per-action logging, or requests to match APIs.
The URL filter permits only `https://vgveto.com`, strips query strings and hashes,
removes record IDs from match/event/log paths, and supplies the sanitized route.
Private link tokens and search terms must never be sent as telemetry.
Previews, localhost and the EMEA archive do not send measurements.

Speed Insights' free tier currently shows Real Experience Score and limited route
breakdowns, with 10,000 events shared across the team over a rolling 30 days.
Collection pauses at the limit; the website keeps running. Sampling reduces event
volume but cannot guarantee 10 days of coverage at an unknown visit count.
Speed Insights Plus is a separate paid add-on on Pro, with a project fee and event
charges. Neither Plus nor Observability Plus was purchased as part of this setup.
See [current Speed Insights pricing](https://vercel.com/docs/speed-insights/limits-and-pricing).

Vercel's existing server-side Observability and runtime logs require no extra
browser SDK. Compare production requests by route and deployment; look at p95
duration and error rate, not only averages. Successful HTTP requests can still
contain application-level failures, so correlate the relevant logs and workflow.
Do not paste raw request URLs containing match tokens into shared reports.

## Supabase baseline and repeatable checks

`pg_stat_statements` 1.11 was already enabled and collecting query statistics;
no additional extension, public monitoring endpoint or database policy is needed.
Run [performance-snapshot.sql](../scripts/performance-snapshot.sql) in the new
project's SQL editor. It uses a read-only transaction and excludes SQL bodies,
credentials and user records. Export timestamped results before/after a busy round.
Counters are cumulative since reset: subtract snapshots over the same interval;
do not reset statistics during the tournament. These figures include provider
services and scheduled workers, so they are not counts of players or vetoes.

Initial connection snapshot on 15 October 2026: 28 connections out of the
Postgres limit of 60, including provider/internal connections. This is an idle
setup snapshot, not a load test or evidence of capacity for 2,000 players.

The Performance Advisor reported 16 unindexed foreign keys, 13 RLS initialization
warnings, 55 overlapping permissive policy findings and 3 unused indexes. These
are investigation leads, not proven bottlenecks. No RLS policy or index was changed
while installing monitoring. Keep the privacy tests in place before optimizing
policies; unused indexes on a new database should not be removed just for having
zero reads. [Advisor explanation](https://supabase.com/docs/guides/database/database-linter).

## During tournament days

1. Compare a quiet baseline with a busy round using the same time window.
2. Check page experience, API p95/error rate, CPU usage, DB CPU/memory and database
   connections, then Realtime connections/messages and quota usage.
3. Investigate a sustained regression against that baseline. Suggested triage
   triggers: API p95 above 1 second, server errors above 1%, DB CPU or connections
   above 80% for 5 minutes, or any blocked/idle transaction that persists.
   These are starting points, not configured alerts or platform limits.
4. For a slow query compare call count, total time and mean time; repeated cheap
   polling may cost more overall than one individually slow request.
5. After a release, compare the new deployment to the previous one and test an
   actual protected team link. Check that the background sheet worker still runs.

Automatic external alerts, Grafana/Prometheus hosting and uptime monitoring have
not been configured. Built-in dashboards are available immediately; Speed Insights
needs real visits and can take time to aggregate. This setup does not prove load
capacity. Arrange a separate staged concurrency test before tournament traffic.

References: [Speed Insights setup](https://vercel.com/docs/speed-insights/quickstart),
[query statistics](https://supabase.com/docs/guides/database/extensions/pg_stat_statements),
[Supabase metrics](https://supabase.com/docs/guides/observability/metrics).
