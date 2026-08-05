CREATE TABLE IF NOT EXISTS match_roster_players (
  roster_player_id CHAR(36) NOT NULL,
  match_id CHAR(36) NOT NULL,
  team_side ENUM('HOME', 'AWAY') NOT NULL,
  team_id CHAR(36) NOT NULL,
  player_id CHAR(36) NOT NULL,
  display_name_snapshot VARCHAR(200) NOT NULL,
  jersey_number_snapshot VARCHAR(12) NULL,
  position ENUM('GUARD', 'FORWARD', 'CENTER', 'UNKNOWN') NOT NULL DEFAULT 'UNKNOWN',
  roster_status ENUM('ACTIVE', 'BENCH', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  is_starter TINYINT(1) NOT NULL DEFAULT 0,
  is_captain TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (roster_player_id),
  UNIQUE KEY uq_match_roster_players_match_player (match_id, player_id),
  KEY idx_match_roster_players_match_side (match_id, team_side),
  KEY idx_match_roster_players_team_id (team_id),
  KEY idx_match_roster_players_player_id (player_id),
  CONSTRAINT fk_match_roster_players_match
    FOREIGN KEY (match_id) REFERENCES matches (match_id),
  CONSTRAINT fk_match_roster_players_team
    FOREIGN KEY (team_id) REFERENCES teams (team_id),
  CONSTRAINT fk_match_roster_players_player
    FOREIGN KEY (player_id) REFERENCES players (player_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
