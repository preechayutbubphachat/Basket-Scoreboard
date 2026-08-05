CREATE TABLE IF NOT EXISTS match_roster_baseline_snapshots (
  snapshot_id CHAR(36) NOT NULL,
  match_id CHAR(36) NOT NULL,
  team_side ENUM('HOME', 'AWAY') NOT NULL,
  event_seq BIGINT UNSIGNED NOT NULL,
  event_id CHAR(36) NOT NULL,
  canonical_payload_hash CHAR(64) NOT NULL,
  projection_data JSON NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (snapshot_id),
  UNIQUE KEY uq_match_roster_baseline_snapshots_match_side_seq (match_id, team_side, event_seq),
  UNIQUE KEY uq_match_roster_baseline_snapshots_event_id (event_id),
  KEY idx_match_roster_baseline_snapshots_match_seq (match_id, event_seq),
  CONSTRAINT fk_match_roster_baseline_snapshots_match FOREIGN KEY (match_id) REFERENCES matches (match_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
