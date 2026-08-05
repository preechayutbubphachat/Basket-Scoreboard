CREATE TABLE IF NOT EXISTS display_screens (
  screen_id CHAR(36) NOT NULL,
  screen_slug VARCHAR(80) NOT NULL,
  display_name VARCHAR(120) NOT NULL,
  tournament_id CHAR(36) NULL,
  description VARCHAR(255) NULL,
  public_enabled TINYINT(1) NOT NULL DEFAULT 1,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_by_user_id CHAR(36) NULL,
  updated_by_user_id CHAR(36) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (screen_id),
  UNIQUE KEY uq_display_screens_slug (screen_slug),
  KEY idx_display_screens_tournament (tournament_id),
  KEY idx_display_screens_public_active (public_enabled, active),
  KEY idx_display_screens_created_by (created_by_user_id),
  KEY idx_display_screens_updated_by (updated_by_user_id),
  CONSTRAINT fk_display_screens_tournament
    FOREIGN KEY (tournament_id) REFERENCES tournaments (tournament_id),
  CONSTRAINT fk_display_screens_created_by
    FOREIGN KEY (created_by_user_id) REFERENCES users (user_id),
  CONSTRAINT fk_display_screens_updated_by
    FOREIGN KEY (updated_by_user_id) REFERENCES users (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS display_scenes (
  scene_id CHAR(36) NOT NULL,
  screen_id CHAR(36) NOT NULL,
  scene_type VARCHAR(32) NOT NULL,
  scene_name VARCHAR(120) NOT NULL,
  scene_config JSON NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_by_user_id CHAR(36) NULL,
  updated_by_user_id CHAR(36) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (scene_id),
  UNIQUE KEY uq_display_scenes_screen_scene (screen_id, scene_id),
  KEY idx_display_scenes_screen (screen_id),
  KEY idx_display_scenes_type (scene_type),
  KEY idx_display_scenes_active (active),
  KEY idx_display_scenes_created_by (created_by_user_id),
  KEY idx_display_scenes_updated_by (updated_by_user_id),
  CONSTRAINT fk_display_scenes_screen
    FOREIGN KEY (screen_id) REFERENCES display_screens (screen_id),
  CONSTRAINT fk_display_scenes_created_by
    FOREIGN KEY (created_by_user_id) REFERENCES users (user_id),
  CONSTRAINT fk_display_scenes_updated_by
    FOREIGN KEY (updated_by_user_id) REFERENCES users (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS display_screen_active_scenes (
  screen_id CHAR(36) NOT NULL,
  scene_id CHAR(36) NOT NULL,
  assigned_by_user_id CHAR(36) NULL,
  assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (screen_id),
  KEY idx_display_screen_active_scenes_scene (scene_id),
  KEY idx_display_screen_active_scenes_assigned_by (assigned_by_user_id),
  CONSTRAINT fk_display_screen_active_scenes_screen
    FOREIGN KEY (screen_id) REFERENCES display_screens (screen_id),
  CONSTRAINT fk_display_screen_active_scenes_scene
    FOREIGN KEY (screen_id, scene_id) REFERENCES display_scenes (screen_id, scene_id),
  CONSTRAINT fk_display_screen_active_scenes_assigned_by
    FOREIGN KEY (assigned_by_user_id) REFERENCES users (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
