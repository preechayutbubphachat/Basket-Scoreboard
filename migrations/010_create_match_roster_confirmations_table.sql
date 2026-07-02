CREATE TABLE IF NOT EXISTS match_roster_confirmations (
  confirmation_id CHAR(36) NOT NULL,
  match_id CHAR(36) NOT NULL,
  team_side ENUM('HOME', 'AWAY') NOT NULL,
  confirmed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  confirmed_by_user_id CHAR(36) NULL,
  reason VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (confirmation_id),
  UNIQUE KEY uq_match_roster_confirmations_match_side (match_id, team_side),
  KEY idx_match_roster_confirmations_match_id (match_id),
  KEY idx_match_roster_confirmations_team_side (team_side),
  KEY idx_match_roster_confirmations_confirmed_at (confirmed_at),
  CONSTRAINT fk_match_roster_confirmations_match
    FOREIGN KEY (match_id) REFERENCES matches (match_id),
  CONSTRAINT fk_match_roster_confirmations_user
    FOREIGN KEY (confirmed_by_user_id) REFERENCES users (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
