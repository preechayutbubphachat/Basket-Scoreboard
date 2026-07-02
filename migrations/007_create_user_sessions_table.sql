ALTER TABLE users
  ADD COLUMN IF NOT EXISTS last_login_at DATETIME(3) NULL AFTER updated_at;

CREATE TABLE IF NOT EXISTS user_sessions (
  id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  session_token_hash VARCHAR(128) NOT NULL,
  csrf_token_hash VARCHAR(128) NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'ACTIVE',
  expires_at DATETIME(3) NOT NULL,
  revoked_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL,
  last_seen_at DATETIME(3) NULL,
  ip_address_hash VARCHAR(128) NULL,
  user_agent_hash VARCHAR(128) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_user_sessions_token_hash (session_token_hash),
  KEY idx_user_sessions_user_id (user_id),
  KEY idx_user_sessions_expires_at (expires_at),
  KEY idx_user_sessions_status (status),
  CONSTRAINT fk_user_sessions_user
    FOREIGN KEY (user_id) REFERENCES users (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
