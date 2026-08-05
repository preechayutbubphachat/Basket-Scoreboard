CREATE TABLE IF NOT EXISTS audit_logs (
  audit_id CHAR(36) NOT NULL,
  entity_type VARCHAR(120) NOT NULL,
  entity_id CHAR(36) NOT NULL,
  action VARCHAR(120) NOT NULL,
  actor_user_id CHAR(36) NOT NULL,
  actor_role VARCHAR(80) NOT NULL,
  device_id VARCHAR(160) NOT NULL,
  old_value JSON NULL,
  new_value JSON NULL,
  reason VARCHAR(500) NULL,
  correlation_id CHAR(36) NOT NULL,
  causation_id CHAR(36) NULL,
  event_seq BIGINT UNSIGNED NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (audit_id),
  KEY idx_audit_logs_entity (entity_type, entity_id),
  KEY idx_audit_logs_actor_user_id (actor_user_id),
  KEY idx_audit_logs_correlation_id (correlation_id),
  KEY idx_audit_logs_event_seq (event_seq),
  KEY idx_audit_logs_created_at (created_at),
  CONSTRAINT fk_audit_logs_actor_user
    FOREIGN KEY (actor_user_id) REFERENCES users (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
