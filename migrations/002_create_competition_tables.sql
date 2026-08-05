CREATE TABLE IF NOT EXISTS tournaments (
  tournament_id CHAR(36) NOT NULL,
  name VARCHAR(200) NOT NULL,
  status ENUM('DRAFT', 'ACTIVE', 'COMPLETED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
  starts_at DATETIME NULL,
  ends_at DATETIME NULL,
  metadata JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (tournament_id),
  KEY idx_tournaments_status (status),
  KEY idx_tournaments_starts_at (starts_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS teams (
  team_id CHAR(36) NOT NULL,
  tournament_id CHAR(36) NULL,
  name VARCHAR(200) NOT NULL,
  short_name VARCHAR(40) NULL,
  status ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  metadata JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (team_id),
  KEY idx_teams_tournament_id (tournament_id),
  KEY idx_teams_name (name),
  CONSTRAINT fk_teams_tournament
    FOREIGN KEY (tournament_id) REFERENCES tournaments (tournament_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS players (
  player_id CHAR(36) NOT NULL,
  team_id CHAR(36) NOT NULL,
  display_name VARCHAR(200) NOT NULL,
  jersey_number VARCHAR(12) NULL,
  status ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  metadata JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (player_id),
  KEY idx_players_team_id (team_id),
  KEY idx_players_display_name (display_name),
  CONSTRAINT fk_players_team
    FOREIGN KEY (team_id) REFERENCES teams (team_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
