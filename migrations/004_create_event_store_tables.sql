CREATE TABLE IF NOT EXISTS match_streams (
  match_id CHAR(36) NOT NULL,
  last_seq_no BIGINT UNSIGNED NOT NULL DEFAULT 0,
  stream_version BIGINT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (match_id),
  CONSTRAINT fk_match_streams_match
    FOREIGN KEY (match_id) REFERENCES matches (match_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS match_events (
  event_id CHAR(36) NOT NULL,
  match_id CHAR(36) NOT NULL,
  seq_no BIGINT UNSIGNED NOT NULL,
  event_type VARCHAR(120) NOT NULL,
  payload JSON NOT NULL,
  actor_user_id CHAR(36) NOT NULL,
  actor_role VARCHAR(80) NOT NULL,
  device_id VARCHAR(160) NOT NULL,
  occurred_at DATETIME(3) NOT NULL,
  recorded_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  command_id CHAR(36) NOT NULL,
  expected_seq BIGINT UNSIGNED NOT NULL,
  correlation_id CHAR(36) NOT NULL,
  causation_id CHAR(36) NULL,
  reason VARCHAR(500) NULL,
  rule_profile_id VARCHAR(80) NOT NULL,
  PRIMARY KEY (event_id),
  UNIQUE KEY uq_match_events_event_id (event_id),
  UNIQUE KEY uq_match_events_match_seq (match_id, seq_no),
  UNIQUE KEY uq_match_events_match_command (match_id, command_id),
  KEY idx_match_events_match_seq (match_id, seq_no),
  KEY idx_match_events_match_type (match_id, event_type),
  KEY idx_match_events_command_id (command_id),
  KEY idx_match_events_correlation_id (correlation_id),
  KEY idx_match_events_actor_user_id (actor_user_id),
  CONSTRAINT fk_match_events_match
    FOREIGN KEY (match_id) REFERENCES matches (match_id),
  CONSTRAINT fk_match_events_actor_user
    FOREIGN KEY (actor_user_id) REFERENCES users (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS command_deduplication (
  command_id CHAR(36) NOT NULL,
  match_id CHAR(36) NOT NULL,
  command_type VARCHAR(120) NOT NULL,
  request_hash CHAR(64) NOT NULL,
  status ENUM('ACCEPTED', 'REJECTED') NOT NULL,
  result JSON NOT NULL,
  first_seen_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_seen_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (command_id),
  UNIQUE KEY uq_command_deduplication_match_command (match_id, command_id),
  KEY idx_command_deduplication_match_id (match_id),
  KEY idx_command_deduplication_request_hash (request_hash),
  CONSTRAINT fk_command_deduplication_match
    FOREIGN KEY (match_id) REFERENCES matches (match_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
