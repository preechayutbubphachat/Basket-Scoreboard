-- RM-06 technical-foul commands append one foul fact plus two consequence events.
-- Command idempotency remains enforced by command_deduplication; match_events must
-- permit multiple causally-linked events emitted by one accepted command.
-- MariaDB DDL commits implicitly, so every statement is retry-safe if writing
-- schema_migrations fails after the physical schema change has succeeded.
DROP INDEX IF EXISTS uq_match_events_match_command ON match_events;
CREATE INDEX IF NOT EXISTS idx_match_events_match_command
  ON match_events (match_id, command_id);
