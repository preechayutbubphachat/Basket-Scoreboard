CREATE TABLE IF NOT EXISTS matches (
  match_id CHAR(36) NOT NULL,
  tournament_id CHAR(36) NULL,
  home_team_id CHAR(36) NULL,
  away_team_id CHAR(36) NULL,
  match_code VARCHAR(80) NULL,
  status ENUM('DRAFT', 'SCHEDULED', 'LIVE', 'FINAL', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
  scheduled_at DATETIME NULL,
  venue_name VARCHAR(200) NULL,
  rule_profile_id VARCHAR(80) NOT NULL DEFAULT 'FIBA_2024',
  metadata JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (match_id),
  UNIQUE KEY uq_matches_match_code (match_code),
  KEY idx_matches_tournament_id (tournament_id),
  KEY idx_matches_home_team_id (home_team_id),
  KEY idx_matches_away_team_id (away_team_id),
  KEY idx_matches_status_scheduled_at (status, scheduled_at),
  CONSTRAINT fk_matches_tournament
    FOREIGN KEY (tournament_id) REFERENCES tournaments (tournament_id),
  CONSTRAINT fk_matches_home_team
    FOREIGN KEY (home_team_id) REFERENCES teams (team_id),
  CONSTRAINT fk_matches_away_team
    FOREIGN KEY (away_team_id) REFERENCES teams (team_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
