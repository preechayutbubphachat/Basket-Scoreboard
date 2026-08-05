-- RM-06 Head Coach Direct Technical Foul — Match-scoped head coach designation
-- Creates minimal table for bounded head-coach technical foul slice
-- No full staff CRUD; decoupled from RM-08

CREATE TABLE IF NOT EXISTS match_head_coach_designations (
  designation_id CHAR(36) NOT NULL,
  match_id CHAR(36) NOT NULL,
  team_side ENUM('HOME', 'AWAY') NOT NULL,
  display_name VARCHAR(200) NOT NULL,
  external_reference VARCHAR(200) NULL,
  designated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  designated_by CHAR(36) NOT NULL,
  PRIMARY KEY (designation_id),
  UNIQUE KEY uq_match_head_coach_designation (match_id, team_side),
  CONSTRAINT fk_match_hcd_match
    FOREIGN KEY (match_id)
    REFERENCES matches (match_id),
  CONSTRAINT fk_match_hcd_user
    FOREIGN KEY (designated_by)
    REFERENCES users (user_id)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;