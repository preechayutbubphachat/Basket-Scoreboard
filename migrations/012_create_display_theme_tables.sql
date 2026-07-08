CREATE TABLE IF NOT EXISTS tournament_display_themes (
  tournament_id CHAR(36) NOT NULL,
  display_name VARCHAR(120) NULL,
  logo_url VARCHAR(1024) NULL,
  primary_color CHAR(7) NULL,
  secondary_color CHAR(7) NULL,
  accent_color CHAR(7) NULL,
  text_color CHAR(7) NULL,
  background_style ENUM('DEFAULT_ARENA', 'SOLID', 'DARK_GRADIENT', 'HIGH_CONTRAST') NOT NULL DEFAULT 'DEFAULT_ARENA',
  show_tournament_logo TINYINT(1) NOT NULL DEFAULT 1,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_by_user_id CHAR(36) NULL,
  updated_by_user_id CHAR(36) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (tournament_id),
  KEY idx_tournament_display_themes_active (active),
  KEY idx_tournament_display_themes_created_by (created_by_user_id),
  KEY idx_tournament_display_themes_updated_by (updated_by_user_id),
  CONSTRAINT fk_tournament_display_themes_tournament
    FOREIGN KEY (tournament_id) REFERENCES tournaments (tournament_id),
  CONSTRAINT fk_tournament_display_themes_created_by
    FOREIGN KEY (created_by_user_id) REFERENCES users (user_id),
  CONSTRAINT fk_tournament_display_themes_updated_by
    FOREIGN KEY (updated_by_user_id) REFERENCES users (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS team_display_profiles (
  team_id CHAR(36) NOT NULL,
  display_name VARCHAR(80) NULL,
  logo_url VARCHAR(1024) NULL,
  primary_color CHAR(7) NULL,
  secondary_color CHAR(7) NULL,
  accent_color CHAR(7) NULL,
  text_color CHAR(7) NULL,
  show_team_logo TINYINT(1) NOT NULL DEFAULT 1,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_by_user_id CHAR(36) NULL,
  updated_by_user_id CHAR(36) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (team_id),
  KEY idx_team_display_profiles_active (active),
  KEY idx_team_display_profiles_created_by (created_by_user_id),
  KEY idx_team_display_profiles_updated_by (updated_by_user_id),
  CONSTRAINT fk_team_display_profiles_team
    FOREIGN KEY (team_id) REFERENCES teams (team_id),
  CONSTRAINT fk_team_display_profiles_created_by
    FOREIGN KEY (created_by_user_id) REFERENCES users (user_id),
  CONSTRAINT fk_team_display_profiles_updated_by
    FOREIGN KEY (updated_by_user_id) REFERENCES users (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS match_display_overrides (
  match_id CHAR(36) NOT NULL,
  home_primary_color CHAR(7) NULL,
  home_secondary_color CHAR(7) NULL,
  home_accent_color CHAR(7) NULL,
  home_text_color CHAR(7) NULL,
  away_primary_color CHAR(7) NULL,
  away_secondary_color CHAR(7) NULL,
  away_accent_color CHAR(7) NULL,
  away_text_color CHAR(7) NULL,
  show_team_logos TINYINT(1) NOT NULL DEFAULT 1,
  text_only_fallback TINYINT(1) NOT NULL DEFAULT 0,
  neutral_high_contrast TINYINT(1) NOT NULL DEFAULT 0,
  emergency_override_enabled TINYINT(1) NOT NULL DEFAULT 0,
  emergency_reason VARCHAR(255) NULL,
  created_by_user_id CHAR(36) NULL,
  updated_by_user_id CHAR(36) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (match_id),
  KEY idx_match_display_overrides_emergency (emergency_override_enabled),
  KEY idx_match_display_overrides_created_by (created_by_user_id),
  KEY idx_match_display_overrides_updated_by (updated_by_user_id),
  CONSTRAINT fk_match_display_overrides_match
    FOREIGN KEY (match_id) REFERENCES matches (match_id),
  CONSTRAINT fk_match_display_overrides_created_by
    FOREIGN KEY (created_by_user_id) REFERENCES users (user_id),
  CONSTRAINT fk_match_display_overrides_updated_by
    FOREIGN KEY (updated_by_user_id) REFERENCES users (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
