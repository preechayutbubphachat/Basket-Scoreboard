CREATE TABLE IF NOT EXISTS match_projections (
  projection_id CHAR(36) NOT NULL,
  match_id CHAR(36) NOT NULL,
  projection_type VARCHAR(120) NOT NULL,
  projection_version BIGINT UNSIGNED NOT NULL DEFAULT 1,
  last_event_seq BIGINT UNSIGNED NOT NULL DEFAULT 0,
  projection_data JSON NOT NULL,
  rebuilt_at DATETIME(3) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (projection_id),
  UNIQUE KEY uq_match_projections_match_type (match_id, projection_type),
  KEY idx_match_projections_match_seq (match_id, last_event_seq),
  KEY idx_match_projections_type (projection_type),
  CONSTRAINT fk_match_projections_match
    FOREIGN KEY (match_id) REFERENCES matches (match_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
