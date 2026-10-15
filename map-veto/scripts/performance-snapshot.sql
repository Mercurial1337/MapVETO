-- Run in VG Veto's Supabase SQL editor. Read-only; no resets, schema changes,
-- query text, passwords, tokens or user records. Statistics are cumulative.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '5s';

-- Connection headroom includes Supabase's own services, not just visitors.
SELECT current_database() AS database, now() AS captured_at,
       count(*) AS connections,
       count(*) FILTER (WHERE state = 'active') AS active_connections,
       count(*) FILTER (WHERE state = 'idle in transaction') AS idle_in_transaction,
       current_setting('max_connections')::int AS max_connections
FROM pg_stat_activity;

-- Cache ratio, temporary writes and deadlocks since stats_reset.
SELECT stats_reset, numbackends, xact_commit, xact_rollback, deadlocks,
       round(100.0 * blks_hit / nullif(blks_hit + blks_read, 0), 2) AS cache_hit_percent,
       pg_size_pretty(temp_bytes) AS temp_written,
       pg_size_pretty(pg_database_size(datname)) AS database_size
FROM pg_stat_database WHERE datname = current_database();

-- High total execution cost. Query IDs can be investigated in Query Performance.
-- Exclude one-off migrations and setup work by requiring at least 10 calls.
SELECT queryid, calls, round(total_exec_time::numeric, 2) AS total_ms,
       round(mean_exec_time::numeric, 2) AS mean_ms,
       round(max_exec_time::numeric, 2) AS max_ms, rows,
       shared_blks_hit, shared_blks_read, temp_blks_written
FROM extensions.pg_stat_statements
WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
  AND calls >= 10
ORDER BY total_exec_time DESC LIMIT 20;

-- Blocking work, without showing potentially sensitive SQL text.
SELECT pid, state, wait_event_type, wait_event,
       now() - xact_start AS transaction_age,
       cardinality(pg_blocking_pids(pid)) AS blocked_by_count
FROM pg_stat_activity
WHERE datname = current_database() AND pid <> pg_backend_pid()
  AND (cardinality(pg_blocking_pids(pid)) > 0 OR state = 'idle in transaction')
ORDER BY xact_start;

-- Table growth and vacuum health. Do not remove indexes based on a fresh DB's stats.
SELECT relname, n_live_tup, n_dead_tup, last_autovacuum, last_autoanalyze,
       pg_size_pretty(pg_total_relation_size(relid)) AS total_size
FROM pg_stat_user_tables WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(relid) DESC;
COMMIT;
