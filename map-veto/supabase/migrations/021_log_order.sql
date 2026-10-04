-- A monotonic order disambiguates logs written in the same transaction.
ALTER TABLE match_logs ADD COLUMN IF NOT EXISTS log_order bigint GENERATED ALWAYS AS IDENTITY;
CREATE INDEX IF NOT EXISTS match_logs_history_idx ON match_logs(match_id,log_order);
