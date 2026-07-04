CREATE TABLE IF NOT EXISTS venues (
  venue_id CHAR(36) NOT NULL,
  name VARCHAR(200) NOT NULL,
  short_name VARCHAR(80) NULL,
  address VARCHAR(500) NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (venue_id),
  UNIQUE KEY uq_venues_name (name),
  KEY idx_venues_active (active),
  KEY idx_venues_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS courts (
  court_id CHAR(36) NOT NULL,
  venue_id CHAR(36) NOT NULL,
  label VARCHAR(80) NOT NULL,
  display_name VARCHAR(120) NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (court_id),
  UNIQUE KEY uq_courts_venue_label (venue_id, label),
  KEY idx_courts_venue_id (venue_id),
  KEY idx_courts_active (active),
  CONSTRAINT fk_courts_venue
    FOREIGN KEY (venue_id) REFERENCES venues (venue_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
