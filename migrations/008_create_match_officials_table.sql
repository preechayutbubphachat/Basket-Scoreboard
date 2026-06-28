CREATE TABLE IF NOT EXISTS match_officials (
  id CHAR(36) NOT NULL,
  match_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  role_code VARCHAR(40) NOT NULL,
  assignment_status VARCHAR(40) NOT NULL DEFAULT 'ACTIVE',
  assigned_by_user_id CHAR(36) NULL,
  assigned_at DATETIME(3) NOT NULL,
  revoked_by_user_id CHAR(36) NULL,
  revoked_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_match_officials_match_user_role (match_id, user_id, role_code),
  KEY idx_match_officials_match_id (match_id),
  KEY idx_match_officials_user_id (user_id),
  KEY idx_match_officials_role_code (role_code),
  KEY idx_match_officials_assignment_status (assignment_status),
  CONSTRAINT fk_match_officials_match
    FOREIGN KEY (match_id) REFERENCES matches (match_id),
  CONSTRAINT fk_match_officials_user
    FOREIGN KEY (user_id) REFERENCES users (user_id),
  CONSTRAINT fk_match_officials_assigned_by_user
    FOREIGN KEY (assigned_by_user_id) REFERENCES users (user_id),
  CONSTRAINT fk_match_officials_revoked_by_user
    FOREIGN KEY (revoked_by_user_id) REFERENCES users (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
