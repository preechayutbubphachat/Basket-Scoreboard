# DATABASE_SCHEMA.md

## 0. Purpose

[SYSTEM RECOMMENDATION] ไฟล์นี้กำหนดโครงสร้างฐานข้อมูลสำหรับระบบ **Basketball Scoreboard and Tournament Management** ที่ออกแบบให้ใช้กับ **MariaDB/InnoDB บน Hostatom/Plesk Shared Hosting** ได้ โดยยังรักษาหลัก production สำคัญของระบบไว้ ได้แก่:

- `match_events` เป็น source of truth
- event stream เป็น append-only
- correction ใช้ compensating events
- projection rebuild ได้จาก event stream
- snapshot เป็น optimization เท่านั้น
- REST/polling-first realtime ใช้ `lastEventSeq`
- ทุกคำสั่งใช้ `expectedSeq` เพื่อกัน concurrent write
- ทุก correction และ privileged action ต้องมี audit log

[ASSUMPTION] ฐานข้อมูลหลักคือ MariaDB ที่ใช้ storage engine เป็น `InnoDB` และแอป backend เป็น Node.js + TypeScript ที่รันผ่าน Plesk Node.js feature ได้เท่าที่โฮสรองรับ

---

## 1. Database Design Principles

### 1.1 Source of Truth

[SYSTEM RECOMMENDATION] แหล่งความจริงของแมตช์คือ:

```txt
match_events
```

ไม่ใช่:

```txt
live_scoreboard_projection
match_projections
match_snapshots
scoreboard_state
browser state
socket message
```

### 1.2 Append-Only Event Store

[SYSTEM RECOMMENDATION] หลังจาก event ถูกบันทึกแล้ว ห้ามแก้ไขหรือลบ event เดิม

Allowed:

```txt
INSERT new event
INSERT correction event
INSERT audit log
REBUILD projection
CREATE new snapshot
```

Not allowed:

```txt
UPDATE match_events.payload
UPDATE match_events.seq_no
DELETE FROM match_events
overwrite old score/foul/clock event
```

### 1.3 MariaDB-Friendly Design

[SYSTEM RECOMMENDATION] เพื่อให้เหมาะกับ Shared Hosting:

- ใช้ `CHAR(36)` สำหรับ UUID แทน `BINARY(16)` เพื่อ debug ง่ายใน phpMyAdmin
- ใช้ `LONGTEXT` สำหรับ JSON payload พร้อม application-level validation ด้วย Zod
- ใช้ `InnoDB` ทุกตารางที่เกี่ยวข้องกับ transaction
- ใช้ `SELECT ... FOR UPDATE` กับ `match_streams` เพื่อ serialize event append ต่อ match
- หลีกเลี่ยงการพึ่ง background worker ถาวร
- projection update ควรทำใน request transaction เมื่อเป็น live command
- rebuild projection ทำผ่าน admin/manual job ได้

---

## 2. Required Tables Overview

```txt
Auth / RBAC
- users
- roles
- permissions
- user_roles
- role_permissions

Organization / Competition
- organizations
- seasons
- divisions
- tournaments
- tournament_stages
- tournament_groups

Teams / Players / Rosters
- teams
- players
- tournament_rosters
- match_rosters

Match Setup
- venues
- courts
- rule_profiles
- matches
- match_officials

Event Store
- match_streams
- match_events
- command_deduplication

Read Models
- match_snapshots
- match_projections
- projection_checkpoints
- tournament_standings_projection

Audit
- audit_logs
```

---

## 3. Naming Conventions

### 3.1 Table Names

Use plural snake_case:

```txt
users
match_events
tournament_rosters
```

### 3.2 Primary Keys

Use UUID strings:

```sql
id CHAR(36) NOT NULL PRIMARY KEY
```

### 3.3 Timestamps

Use UTC timestamp fields:

```sql
created_at DATETIME(3) NOT NULL
updated_at DATETIME(3) NULL
deleted_at DATETIME(3) NULL
```

### 3.4 Status Columns

Use uppercase enum-like strings:

```txt
DRAFT
SCHEDULED
READY
LIVE
PAUSED
FINISHED
CANCELLED
CORRECTED
```

Do not rely on MariaDB `ENUM` for core domain statuses unless the team accepts migration friction. Prefer `VARCHAR(40)` plus application validation.

---

## 4. Auth and RBAC Tables

## 4.1 `users`

Stores login identity and basic user profile.

```sql
CREATE TABLE users (
  id CHAR(36) NOT NULL,
  email VARCHAR(190) NOT NULL,
  display_name VARCHAR(190) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'ACTIVE',
  last_login_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NULL,
  deleted_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### Required statuses

```txt
ACTIVE
DISABLED
INVITED
LOCKED
```

### AI Agent Rules

- ห้ามเก็บ password plain text
- ห้ามเชื่อ role จาก client
- ทุก API ต้อง resolve user จาก session/token ฝั่ง server

---

## 4.2 `roles`

```sql
CREATE TABLE roles (
  id CHAR(36) NOT NULL,
  code VARCHAR(80) NOT NULL,
  name VARCHAR(190) NOT NULL,
  description TEXT NULL,
  is_system_role TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_roles_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### Default role codes

```txt
ADMIN
REFEREE_SCORER
VIEWER
PUBLIC_SCOREBOARD
```

Optional fine-grained roles:

```txt
SCORER
TIMER
SHOT_CLOCK_OPERATOR
MATCH_SUPERVISOR
TOURNAMENT_MANAGER
```

---

## 4.3 `permissions`

```sql
CREATE TABLE permissions (
  id CHAR(36) NOT NULL,
  code VARCHAR(120) NOT NULL,
  description TEXT NULL,
  created_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_permissions_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### Permission code examples

```txt
tournament.create
tournament.update
team.manage
player.manage
match.create
match.assign_official
match.view
match.operate_score
match.operate_clock
match.operate_shot_clock
match.operate_foul
match.operate_timeout
match.operate_possession
match.request_correction
match.apply_correction
match.view_audit
rule_profile.manage
user.manage
```

---

## 4.4 `user_roles`

```sql
CREATE TABLE user_roles (
  id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  role_id CHAR(36) NOT NULL,
  scope_type VARCHAR(40) NOT NULL DEFAULT 'GLOBAL',
  scope_id CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_user_roles_scope (user_id, role_id, scope_type, scope_id),
  KEY idx_user_roles_user (user_id),
  KEY idx_user_roles_role (role_id),
  CONSTRAINT fk_user_roles_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_user_roles_role FOREIGN KEY (role_id) REFERENCES roles(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### Scope examples

```txt
GLOBAL
ORGANIZATION
TOURNAMENT
MATCH
```

---

## 4.5 `role_permissions`

```sql
CREATE TABLE role_permissions (
  id CHAR(36) NOT NULL,
  role_id CHAR(36) NOT NULL,
  permission_id CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_role_permissions (role_id, permission_id),
  CONSTRAINT fk_role_permissions_role FOREIGN KEY (role_id) REFERENCES roles(id),
  CONSTRAINT fk_role_permissions_permission FOREIGN KEY (permission_id) REFERENCES permissions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

---

## 5. Organization and Tournament Tables

## 5.1 `organizations`

```sql
CREATE TABLE organizations (
  id CHAR(36) NOT NULL,
  name VARCHAR(190) NOT NULL,
  slug VARCHAR(190) NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'ACTIVE',
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NULL,
  deleted_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_organizations_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

---

## 5.2 `seasons`

```sql
CREATE TABLE seasons (
  id CHAR(36) NOT NULL,
  organization_id CHAR(36) NOT NULL,
  name VARCHAR(190) NOT NULL,
  starts_on DATE NULL,
  ends_on DATE NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'ACTIVE',
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  KEY idx_seasons_org (organization_id),
  CONSTRAINT fk_seasons_org FOREIGN KEY (organization_id) REFERENCES organizations(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

---

## 5.3 `divisions`

```sql
CREATE TABLE divisions (
  id CHAR(36) NOT NULL,
  organization_id CHAR(36) NOT NULL,
  name VARCHAR(190) NOT NULL,
  code VARCHAR(80) NULL,
  gender VARCHAR(40) NULL,
  age_group VARCHAR(80) NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  KEY idx_divisions_org (organization_id),
  CONSTRAINT fk_divisions_org FOREIGN KEY (organization_id) REFERENCES organizations(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

---

## 5.4 `tournaments`

```sql
CREATE TABLE tournaments (
  id CHAR(36) NOT NULL,
  organization_id CHAR(36) NOT NULL,
  season_id CHAR(36) NULL,
  division_id CHAR(36) NULL,
  rule_profile_id CHAR(36) NOT NULL,
  name VARCHAR(190) NOT NULL,
  slug VARCHAR(190) NOT NULL,
  format_type VARCHAR(60) NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'DRAFT',
  starts_at DATETIME(3) NULL,
  ends_at DATETIME(3) NULL,
  settings_json LONGTEXT NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NULL,
  deleted_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tournaments_org_slug (organization_id, slug),
  KEY idx_tournaments_org (organization_id),
  KEY idx_tournaments_status (status),
  KEY idx_tournaments_rule_profile (rule_profile_id),
  CONSTRAINT fk_tournaments_org FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CONSTRAINT fk_tournaments_season FOREIGN KEY (season_id) REFERENCES seasons(id),
  CONSTRAINT fk_tournaments_division FOREIGN KEY (division_id) REFERENCES divisions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### `format_type`

```txt
ROUND_ROBIN
GROUP_STAGE
SINGLE_ELIMINATION
DOUBLE_ELIMINATION
BEST_OF_SERIES
AGGREGATE_SERIES
SWISS
CUSTOM
```

[NEEDS SOURCE] Tournament tie-break rules must be defined in a separate `TOURNAMENT_RULES.md` or `TIEBREAK_RULES.md` before full automation.

---

## 5.5 `tournament_stages`

```sql
CREATE TABLE tournament_stages (
  id CHAR(36) NOT NULL,
  tournament_id CHAR(36) NOT NULL,
  name VARCHAR(190) NOT NULL,
  stage_type VARCHAR(60) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  status VARCHAR(40) NOT NULL DEFAULT 'DRAFT',
  settings_json LONGTEXT NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  KEY idx_stages_tournament (tournament_id),
  CONSTRAINT fk_stages_tournament FOREIGN KEY (tournament_id) REFERENCES tournaments(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

---

## 5.6 `tournament_groups`

```sql
CREATE TABLE tournament_groups (
  id CHAR(36) NOT NULL,
  tournament_id CHAR(36) NOT NULL,
  stage_id CHAR(36) NOT NULL,
  name VARCHAR(190) NOT NULL,
  code VARCHAR(40) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  settings_json LONGTEXT NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  KEY idx_groups_tournament (tournament_id),
  KEY idx_groups_stage (stage_id),
  CONSTRAINT fk_groups_tournament FOREIGN KEY (tournament_id) REFERENCES tournaments(id),
  CONSTRAINT fk_groups_stage FOREIGN KEY (stage_id) REFERENCES tournament_stages(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

---

## 6. Venue and Court Tables

## 6.1 `venues`

```sql
CREATE TABLE venues (
  id CHAR(36) NOT NULL,
  organization_id CHAR(36) NOT NULL,
  name VARCHAR(190) NOT NULL,
  address TEXT NULL,
  timezone VARCHAR(80) NOT NULL DEFAULT 'Asia/Bangkok',
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NULL,
  deleted_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  KEY idx_venues_org (organization_id),
  CONSTRAINT fk_venues_org FOREIGN KEY (organization_id) REFERENCES organizations(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

---

## 6.2 `courts`

```sql
CREATE TABLE courts (
  id CHAR(36) NOT NULL,
  venue_id CHAR(36) NOT NULL,
  name VARCHAR(190) NOT NULL,
  court_code VARCHAR(40) NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'ACTIVE',
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  KEY idx_courts_venue (venue_id),
  CONSTRAINT fk_courts_venue FOREIGN KEY (venue_id) REFERENCES venues(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

---

## 7. Team, Player, and Roster Tables

## 7.1 `teams`

```sql
CREATE TABLE teams (
  id CHAR(36) NOT NULL,
  organization_id CHAR(36) NOT NULL,
  name VARCHAR(190) NOT NULL,
  short_name VARCHAR(40) NULL,
  logo_url TEXT NULL,
  primary_color VARCHAR(20) NULL,
  secondary_color VARCHAR(20) NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'ACTIVE',
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NULL,
  deleted_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  KEY idx_teams_org (organization_id),
  KEY idx_teams_name (name),
  CONSTRAINT fk_teams_org FOREIGN KEY (organization_id) REFERENCES organizations(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

---

## 7.2 `players`

```sql
CREATE TABLE players (
  id CHAR(36) NOT NULL,
  organization_id CHAR(36) NOT NULL,
  display_name VARCHAR(190) NOT NULL,
  first_name VARCHAR(120) NULL,
  last_name VARCHAR(120) NULL,
  birth_date DATE NULL,
  gender VARCHAR(40) NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'ACTIVE',
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NULL,
  deleted_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  KEY idx_players_org (organization_id),
  KEY idx_players_display_name (display_name),
  CONSTRAINT fk_players_org FOREIGN KEY (organization_id) REFERENCES organizations(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

[NEEDS SOURCE] Player eligibility, age limits, registration deadlines, and roster size limits must follow tournament/local regulations unless verified in an official rule document.

---

## 7.3 `tournament_rosters`

This is the roster of a team inside one tournament.

```sql
CREATE TABLE tournament_rosters (
  id CHAR(36) NOT NULL,
  tournament_id CHAR(36) NOT NULL,
  team_id CHAR(36) NOT NULL,
  player_id CHAR(36) NOT NULL,
  jersey_number VARCHAR(10) NULL,
  roster_status VARCHAR(40) NOT NULL DEFAULT 'ACTIVE',
  registered_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tournament_roster_player (tournament_id, team_id, player_id),
  UNIQUE KEY uq_tournament_roster_jersey (tournament_id, team_id, jersey_number),
  KEY idx_tournament_rosters_tournament_team (tournament_id, team_id),
  CONSTRAINT fk_tournament_rosters_tournament FOREIGN KEY (tournament_id) REFERENCES tournaments(id),
  CONSTRAINT fk_tournament_rosters_team FOREIGN KEY (team_id) REFERENCES teams(id),
  CONSTRAINT fk_tournament_rosters_player FOREIGN KEY (player_id) REFERENCES players(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### AI Agent Rules

- ห้ามใช้ `players` ตรง ๆ เป็น roster ของ match
- ต้องแยก `TournamentRoster` กับ `MatchRoster`
- เลขเสื้อต้อง validate ตาม rule/tournament profile

---

## 8. Rule Profile Tables

## 8.1 `rule_profiles`

Stores FIBA/default and local override profiles.

```sql
CREATE TABLE rule_profiles (
  id CHAR(36) NOT NULL,
  code VARCHAR(80) NOT NULL,
  name VARCHAR(190) NOT NULL,
  governing_body VARCHAR(80) NOT NULL,
  version_label VARCHAR(80) NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'ACTIVE',
  config_json LONGTEXT NOT NULL,
  source_document_ref TEXT NULL,
  created_by_user_id CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_rule_profiles_code_version (code, version_label),
  KEY idx_rule_profiles_status (status),
  CONSTRAINT fk_rule_profiles_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### Example codes

```txt
FIBA_2024
LOCAL_SCHOOL_2026
LOCAL_3X3_PENDING
```

### AI Agent Rules

- FIBA is default
- Unknown rule must return `[NEEDS SOURCE]`
- Do not silently mix FIBA/NBA/NCAA
- Local overrides must be stored as explicit rule profile versions

---

## 9. Match Setup Tables

## 9.1 `matches`

```sql
CREATE TABLE matches (
  id CHAR(36) NOT NULL,
  tournament_id CHAR(36) NOT NULL,
  stage_id CHAR(36) NULL,
  group_id CHAR(36) NULL,
  rule_profile_id CHAR(36) NOT NULL,
  venue_id CHAR(36) NULL,
  court_id CHAR(36) NULL,
  home_team_id CHAR(36) NOT NULL,
  away_team_id CHAR(36) NOT NULL,
  match_code VARCHAR(80) NULL,
  scheduled_start_at DATETIME(3) NULL,
  actual_start_at DATETIME(3) NULL,
  actual_end_at DATETIME(3) NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'SCHEDULED',
  current_seq_no BIGINT UNSIGNED NOT NULL DEFAULT 0,
  public_access_token VARCHAR(120) NULL,
  settings_json LONGTEXT NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NULL,
  deleted_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_matches_public_token (public_access_token),
  KEY idx_matches_tournament (tournament_id),
  KEY idx_matches_stage (stage_id),
  KEY idx_matches_group (group_id),
  KEY idx_matches_scheduled_start (scheduled_start_at),
  KEY idx_matches_status (status),
  KEY idx_matches_teams (home_team_id, away_team_id),
  CONSTRAINT fk_matches_tournament FOREIGN KEY (tournament_id) REFERENCES tournaments(id),
  CONSTRAINT fk_matches_stage FOREIGN KEY (stage_id) REFERENCES tournament_stages(id),
  CONSTRAINT fk_matches_group FOREIGN KEY (group_id) REFERENCES tournament_groups(id),
  CONSTRAINT fk_matches_rule_profile FOREIGN KEY (rule_profile_id) REFERENCES rule_profiles(id),
  CONSTRAINT fk_matches_venue FOREIGN KEY (venue_id) REFERENCES venues(id),
  CONSTRAINT fk_matches_court FOREIGN KEY (court_id) REFERENCES courts(id),
  CONSTRAINT fk_matches_home_team FOREIGN KEY (home_team_id) REFERENCES teams(id),
  CONSTRAINT fk_matches_away_team FOREIGN KEY (away_team_id) REFERENCES teams(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### Required statuses

```txt
SCHEDULED
READY
LIVE
PAUSED
PERIOD_BREAK
FINISHED
CANCELLED
FORFEITED
UNDER_REVIEW
OFFICIAL
```

### AI Agent Rules

- `current_seq_no` is a convenience mirror only
- authoritative sequence is `match_streams.last_seq_no` and `match_events`
- do not update score/foul fields directly on `matches`

---

## 9.2 `match_rosters`

This is the active roster for a specific match.

```sql
CREATE TABLE match_rosters (
  id CHAR(36) NOT NULL,
  match_id CHAR(36) NOT NULL,
  team_id CHAR(36) NOT NULL,
  player_id CHAR(36) NOT NULL,
  tournament_roster_id CHAR(36) NULL,
  jersey_number VARCHAR(10) NULL,
  starter TINYINT(1) NOT NULL DEFAULT 0,
  match_status VARCHAR(40) NOT NULL DEFAULT 'AVAILABLE',
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_match_roster_player (match_id, team_id, player_id),
  UNIQUE KEY uq_match_roster_jersey (match_id, team_id, jersey_number),
  KEY idx_match_rosters_match_team (match_id, team_id),
  KEY idx_match_rosters_player (player_id),
  CONSTRAINT fk_match_rosters_match FOREIGN KEY (match_id) REFERENCES matches(id),
  CONSTRAINT fk_match_rosters_team FOREIGN KEY (team_id) REFERENCES teams(id),
  CONSTRAINT fk_match_rosters_player FOREIGN KEY (player_id) REFERENCES players(id),
  CONSTRAINT fk_match_rosters_tournament_roster FOREIGN KEY (tournament_roster_id) REFERENCES tournament_rosters(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### `match_status`

```txt
AVAILABLE
ON_COURT
BENCH
FOULED_OUT
DISQUALIFIED
INJURED
EJECTED
INACTIVE
```

---

## 9.3 `match_officials`

Assigns users to a match.

```sql
CREATE TABLE match_officials (
  id CHAR(36) NOT NULL,
  match_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  role_code VARCHAR(80) NOT NULL,
  assigned_by_user_id CHAR(36) NULL,
  assigned_at DATETIME(3) NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'ACTIVE',
  PRIMARY KEY (id),
  UNIQUE KEY uq_match_official (match_id, user_id, role_code),
  KEY idx_match_officials_match (match_id),
  KEY idx_match_officials_user (user_id),
  CONSTRAINT fk_match_officials_match FOREIGN KEY (match_id) REFERENCES matches(id),
  CONSTRAINT fk_match_officials_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_match_officials_assigned_by FOREIGN KEY (assigned_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### Role codes

```txt
REFEREE
SCORER
ASSISTANT_SCORER
TIMER
SHOT_CLOCK_OPERATOR
MATCH_SUPERVISOR
```

---

## 10. Event Store Tables

## 10.1 `match_streams`

One row per match stream. Used for optimistic concurrency and event sequence allocation.

```sql
CREATE TABLE match_streams (
  match_id CHAR(36) NOT NULL,
  last_seq_no BIGINT UNSIGNED NOT NULL DEFAULT 0,
  last_event_id CHAR(36) NULL,
  stream_status VARCHAR(40) NOT NULL DEFAULT 'OPEN',
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NULL,
  PRIMARY KEY (match_id),
  CONSTRAINT fk_match_streams_match FOREIGN KEY (match_id) REFERENCES matches(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### `stream_status`

```txt
OPEN
LOCKED
CLOSED
UNDER_REVIEW
```

### Why this table exists

[SYSTEM RECOMMENDATION] Live command handler must lock this row:

```sql
SELECT last_seq_no
FROM match_streams
WHERE match_id = ?
FOR UPDATE;
```

Then compare with `expectedSeq`.

---

## 10.2 `match_events`

The canonical append-only event store.

```sql
CREATE TABLE match_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  event_id CHAR(36) NOT NULL,
  match_id CHAR(36) NOT NULL,
  seq_no BIGINT UNSIGNED NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  event_version INT NOT NULL DEFAULT 1,
  payload_json LONGTEXT NOT NULL,
  actor_user_id CHAR(36) NULL,
  actor_role VARCHAR(80) NULL,
  device_id VARCHAR(120) NULL,
  occurred_at DATETIME(3) NOT NULL,
  recorded_at DATETIME(3) NOT NULL,
  correlation_id CHAR(36) NOT NULL,
  causation_id CHAR(36) NULL,
  command_id CHAR(36) NULL,
  expected_seq BIGINT UNSIGNED NULL,
  reason TEXT NULL,
  rule_profile_id CHAR(36) NOT NULL,
  is_correction TINYINT(1) NOT NULL DEFAULT 0,
  target_event_id CHAR(36) NULL,
  target_seq_no BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_match_events_event_id (event_id),
  UNIQUE KEY uq_match_events_match_seq (match_id, seq_no),
  KEY idx_match_events_match_type (match_id, event_type),
  KEY idx_match_events_match_recorded (match_id, recorded_at),
  KEY idx_match_events_correlation (correlation_id),
  KEY idx_match_events_command (match_id, command_id),
  KEY idx_match_events_target (match_id, target_seq_no),
  CONSTRAINT fk_match_events_match FOREIGN KEY (match_id) REFERENCES matches(id),
  CONSTRAINT fk_match_events_actor FOREIGN KEY (actor_user_id) REFERENCES users(id),
  CONSTRAINT fk_match_events_rule_profile FOREIGN KEY (rule_profile_id) REFERENCES rule_profiles(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### Critical constraints

```txt
UNIQUE(event_id)
UNIQUE(match_id, seq_no)
INDEX(match_id, seq_no)
INDEX(match_id, event_type)
INDEX(match_id, command_id)
```

### Append-only policy

[SYSTEM RECOMMENDATION] Enforce append-only at application layer. If the hosting environment allows DB triggers, optional triggers may block update/delete, but application policy is mandatory.

Optional trigger:

```sql
-- Optional only if hosting allows triggers.
-- Do not depend on this as the only protection.

DELIMITER $$

CREATE TRIGGER trg_match_events_no_update
BEFORE UPDATE ON match_events
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'match_events is append-only';
END$$

CREATE TRIGGER trg_match_events_no_delete
BEFORE DELETE ON match_events
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'match_events is append-only';
END$$

DELIMITER ;
```

[ASSUMPTION] Some shared hosting environments may restrict triggers. Therefore the Node.js command handler must enforce append-only behavior regardless of trigger availability.

---

## 10.3 `command_deduplication`

Prevents duplicate live commands from double-appending events.

```sql
CREATE TABLE command_deduplication (
  id CHAR(36) NOT NULL,
  match_id CHAR(36) NOT NULL,
  command_id CHAR(36) NOT NULL,
  actor_user_id CHAR(36) NULL,
  command_type VARCHAR(100) NOT NULL,
  request_hash VARCHAR(128) NOT NULL,
  status VARCHAR(40) NOT NULL,
  resulting_event_id CHAR(36) NULL,
  resulting_seq_no BIGINT UNSIGNED NULL,
  response_json LONGTEXT NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_command_dedup_match_command (match_id, command_id),
  KEY idx_command_dedup_match_status (match_id, status),
  CONSTRAINT fk_command_dedup_match FOREIGN KEY (match_id) REFERENCES matches(id),
  CONSTRAINT fk_command_dedup_actor FOREIGN KEY (actor_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### Statuses

```txt
PROCESSING
ACCEPTED
REJECTED
FAILED
```

### AI Agent Rules

- Duplicate `commandId` with same request hash returns prior result
- Duplicate `commandId` with different request hash returns `DUPLICATE_COMMAND_CONFLICT`
- Do not append a second event for same command

---

## 11. Snapshot and Projection Tables

## 11.1 `match_snapshots`

Snapshots speed up rehydration.

```sql
CREATE TABLE match_snapshots (
  id CHAR(36) NOT NULL,
  match_id CHAR(36) NOT NULL,
  last_seq_no BIGINT UNSIGNED NOT NULL,
  snapshot_version INT NOT NULL DEFAULT 1,
  state_json LONGTEXT NOT NULL,
  checksum VARCHAR(128) NULL,
  created_at DATETIME(3) NOT NULL,
  created_by_process VARCHAR(80) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_match_snapshots_match_seq (match_id, last_seq_no),
  KEY idx_match_snapshots_latest (match_id, last_seq_no),
  CONSTRAINT fk_match_snapshots_match FOREIGN KEY (match_id) REFERENCES matches(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### Snapshot rules

```txt
- Snapshot is not source of truth
- Snapshot can be deleted and rebuilt
- Snapshot must include last_seq_no
- Snapshot must never invent event-derived state
```

Recommended frequency:

```txt
Every 25-100 events
At period end
At match end
After large correction sequence
```

---

## 11.2 `match_projections`

Generic projection table for live and operator UI.

```sql
CREATE TABLE match_projections (
  id CHAR(36) NOT NULL,
  match_id CHAR(36) NOT NULL,
  projection_name VARCHAR(100) NOT NULL,
  projection_version INT NOT NULL DEFAULT 1,
  last_seq_no BIGINT UNSIGNED NOT NULL,
  state_json LONGTEXT NOT NULL,
  checksum VARCHAR(128) NULL,
  is_stale TINYINT(1) NOT NULL DEFAULT 0,
  rebuilt_at DATETIME(3) NULL,
  updated_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_match_projection_name (match_id, projection_name),
  KEY idx_match_projections_match_seq (match_id, last_seq_no),
  CONSTRAINT fk_match_projections_match FOREIGN KEY (match_id) REFERENCES matches(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### Projection names

```txt
live_scoreboard_projection
operator_score_projection
foul_projection
timeout_projection
clock_projection
shot_clock_projection
match_summary_projection
replay_timeline_projection
```

### AI Agent Rules

- UI reads projections
- Projection bugs must not mutate event store
- Projection rebuild starts from `match_events`
- A stale projection must trigger full sync or rebuild

---

## 11.3 `projection_checkpoints`

Tracks projection rebuild/apply progress.

```sql
CREATE TABLE projection_checkpoints (
  id CHAR(36) NOT NULL,
  projection_name VARCHAR(100) NOT NULL,
  match_id CHAR(36) NULL,
  last_processed_seq_no BIGINT UNSIGNED NOT NULL DEFAULT 0,
  status VARCHAR(40) NOT NULL DEFAULT 'OK',
  error_message TEXT NULL,
  updated_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_projection_checkpoint (projection_name, match_id),
  KEY idx_projection_checkpoints_status (status),
  CONSTRAINT fk_projection_checkpoints_match FOREIGN KEY (match_id) REFERENCES matches(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

---

## 11.4 `tournament_standings_projection`

Read model for standings. Rebuildable from official match results and tournament rules.

```sql
CREATE TABLE tournament_standings_projection (
  id CHAR(36) NOT NULL,
  tournament_id CHAR(36) NOT NULL,
  stage_id CHAR(36) NULL,
  group_id CHAR(36) NULL,
  team_id CHAR(36) NOT NULL,
  matches_played INT NOT NULL DEFAULT 0,
  wins INT NOT NULL DEFAULT 0,
  losses INT NOT NULL DEFAULT 0,
  draws INT NOT NULL DEFAULT 0,
  points_for INT NOT NULL DEFAULT 0,
  points_against INT NOT NULL DEFAULT 0,
  points_diff INT NOT NULL DEFAULT 0,
  classification_points INT NOT NULL DEFAULT 0,
  rank_no INT NULL,
  tiebreak_json LONGTEXT NULL,
  last_recomputed_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_standings_team_scope (tournament_id, stage_id, group_id, team_id),
  KEY idx_standings_tournament_rank (tournament_id, stage_id, group_id, rank_no),
  CONSTRAINT fk_standings_tournament FOREIGN KEY (tournament_id) REFERENCES tournaments(id),
  CONSTRAINT fk_standings_stage FOREIGN KEY (stage_id) REFERENCES tournament_stages(id),
  CONSTRAINT fk_standings_group FOREIGN KEY (group_id) REFERENCES tournament_groups(id),
  CONSTRAINT fk_standings_team FOREIGN KEY (team_id) REFERENCES teams(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

[NEEDS SOURCE] Exact classification points and tie-break order must be confirmed in `TIEBREAK_RULES.md` before automatic official standings are enabled.

---

## 12. Audit Tables

## 12.1 `audit_logs`

Stores security, correction, and admin actions.

```sql
CREATE TABLE audit_logs (
  id CHAR(36) NOT NULL,
  audit_type VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100) NOT NULL,
  entity_id CHAR(36) NULL,
  match_id CHAR(36) NULL,
  actor_user_id CHAR(36) NULL,
  actor_role VARCHAR(80) NULL,
  device_id VARCHAR(120) NULL,
  ip_address VARCHAR(80) NULL,
  user_agent TEXT NULL,
  old_value_json LONGTEXT NULL,
  new_value_json LONGTEXT NULL,
  reason TEXT NULL,
  correlation_id CHAR(36) NULL,
  causation_id CHAR(36) NULL,
  event_id CHAR(36) NULL,
  event_seq_no BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_audit_logs_type_created (audit_type, created_at),
  KEY idx_audit_logs_match (match_id, created_at),
  KEY idx_audit_logs_actor (actor_user_id, created_at),
  KEY idx_audit_logs_entity (entity_type, entity_id),
  CONSTRAINT fk_audit_logs_match FOREIGN KEY (match_id) REFERENCES matches(id),
  CONSTRAINT fk_audit_logs_actor FOREIGN KEY (actor_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### Required audit types

```txt
AUTH_LOGIN
AUTH_LOGOUT
AUTH_DENIED
MATCH_COMMAND_ACCEPTED
MATCH_COMMAND_REJECTED
CORRECTION_REQUESTED
CORRECTION_APPLIED
CORRECTION_REJECTED
ROLE_CHANGED
MATCH_OFFICIAL_ASSIGNED
RULE_PROFILE_CHANGED
PROJECTION_REBUILT
ADMIN_OVERRIDE
```

### Correction audit required fields

```txt
actor_user_id
actor_role
device_id
created_at
old_value_json
new_value_json
reason
correlation_id
causation_id
event_id
event_seq_no
```

---

## 13. Transaction Rules

## 13.1 Live Command Transaction

[SYSTEM RECOMMENDATION] Every accepted live command should follow this transaction pattern:

```txt
BEGIN TRANSACTION

1. Check authentication
2. Check RBAC and match assignment
3. Validate request payload with Zod
4. Check command_deduplication
5. Lock match_streams row with SELECT ... FOR UPDATE
6. Compare expectedSeq with last_seq_no
7. Rehydrate or read current projection
8. Run rules engine decision
9. If rejected:
   - write command_deduplication status REJECTED
   - write audit log
   - COMMIT
   - return COMMAND_REJECTED
10. If accepted:
   - allocate next seq_no
   - insert match_events
   - update match_streams.last_seq_no
   - update matches.current_seq_no
   - update required match_projections
   - optionally insert/update match_snapshots
   - write audit log
   - write command_deduplication status ACCEPTED
   - COMMIT
11. Return current seqNo and projection patch
```

### SQL-style transaction skeleton

```sql
START TRANSACTION;

SELECT last_seq_no
FROM match_streams
WHERE match_id = ?
FOR UPDATE;

-- application compares last_seq_no with expectedSeq

INSERT INTO match_events (...);

UPDATE match_streams
SET last_seq_no = ?, last_event_id = ?, updated_at = ?
WHERE match_id = ?;

UPDATE matches
SET current_seq_no = ?, updated_at = ?
WHERE id = ?;

-- update projections / audit / dedup

COMMIT;
```

---

## 13.2 Rejected Command Rule

Rejected commands should not append normal domain events.

Allowed records:

```txt
command_deduplication REJECTED
audit_logs MATCH_COMMAND_REJECTED
```

---

## 13.3 Correction Transaction

```txt
BEGIN TRANSACTION

1. Verify correction permission
2. Require correction reason
3. Lock match_streams
4. Validate target event exists
5. Append CORRECTION_REQUESTED
6. Append compensating event(s)
7. Append corrected replacement event(s), if needed
8. Append CORRECTION_APPLIED
9. Update projections
10. Insert audit log
11. COMMIT
```

---

## 14. Polling-First Realtime Schema Usage

### Client sync request

```http
GET /api/v1/matches/{matchId}/sync?lastEventSeq=123&projection=live_scoreboard_projection
```

### Backend reads

```sql
SELECT *
FROM match_events
WHERE match_id = ?
  AND seq_no > ?
ORDER BY seq_no ASC;
```

Then returns:

```json
{
  "matchId": "uuid",
  "currentSeq": 130,
  "projection": {},
  "missedEvents": [],
  "fullSyncRequired": false
}
```

### Full sync condition

Return `fullSyncRequired = true` when:

```txt
- requested projection is stale
- client lastEventSeq is too old
- missed event list too large
- projection version changed
- checksum mismatch
```

---

## 15. Clock and Shot Clock Persistence

[SYSTEM RECOMMENDATION] Do not update game clock every second.

Use event payload and projection state:

```json
{
  "clockState": "RUNNING",
  "remainingMsAtStart": 421000,
  "startedAtServerTime": "2026-06-26T10:00:00.000Z",
  "serverNowAtResponse": "2026-06-26T10:00:03.000Z"
}
```

On stop, append event with computed remaining time:

```json
{
  "clockState": "STOPPED",
  "remainingMs": 418000,
  "stoppedAtServerTime": "2026-06-26T10:00:03.000Z"
}
```

### AI Agent Rules

- ห้ามใช้ database write ทุกวินาที
- ห้ามใช้ backend `setInterval()` เป็น source of truth
- Browser แสดง countdown จาก server timestamp ได้ แต่ final state ต้องมาจาก command/event

---

## 16. JSON Validation Policy

MariaDB JSON support may vary by hosting configuration. Therefore:

[SYSTEM RECOMMENDATION] Treat `*_json` columns as serialized JSON strings and validate at application layer with Zod.

Required validation:

```txt
payload_json
state_json
settings_json
config_json
response_json
old_value_json
new_value_json
tiebreak_json
```

Optional DB-level check if supported:

```sql
CHECK (JSON_VALID(payload_json))
```

Do not depend on DB JSON checks as the only validation layer.

---

## 17. Soft Delete Policy

Soft delete tables:

```txt
users
organizations
teams
players
tournaments
matches
venues
```

Never soft delete:

```txt
match_events
audit_logs
command_deduplication
```

For historical integrity, avoid deleting rows referenced by match events. Use status changes instead.

---

## 18. Indexing Policy

### Must-have indexes

```txt
match_events(match_id, seq_no)
match_events(match_id, event_type)
match_events(match_id, command_id)
match_projections(match_id, projection_name)
match_snapshots(match_id, last_seq_no)
audit_logs(match_id, created_at)
matches(tournament_id, scheduled_start_at)
match_rosters(match_id, team_id)
```

### Index caution

Shared hosting MariaDB may have limited resources. Avoid excessive indexes until query patterns are confirmed.

---

## 19. Migration Policy

[SYSTEM RECOMMENDATION] On Hostatom/Plesk shared hosting, migrations should be safe to run manually if no SSH is available.

Preferred options:

```txt
Option A: Node.js migration script through Plesk if allowed
Option B: SQL migration files executed through phpMyAdmin
Option C: Admin-only migration endpoint protected by strong authorization, disabled by default
```

### Migration file naming

```txt
migrations/
  001_create_auth_tables.sql
  002_create_tournament_tables.sql
  003_create_match_tables.sql
  004_create_event_store_tables.sql
  005_create_projection_tables.sql
  006_create_audit_tables.sql
```

### Migration rules

- Migration must be idempotency-aware where possible
- Never drop `match_events` in production
- Never rewrite event payloads without export/backup and Product Owner approval
- Every production migration requires backup first

---

## 20. Backup and Recovery Policy

### Required backup targets

```txt
match_events
audit_logs
matches
match_rosters
tournament_rosters
teams
players
rule_profiles
match_projections
match_snapshots
```

### Recovery priority

```txt
1. match_events
2. audit_logs
3. core tournament/match/team/player data
4. projections
5. snapshots
```

[SYSTEM RECOMMENDATION] If projections are lost but events remain, rebuild projections. If events are lost, official replay/audit integrity is broken.

---

## 21. Data Retention Policy

[ASSUMPTION] Default retention should be:

```txt
match_events: permanent
audit_logs: permanent or according to organization policy
public scoreboard projections: rebuildable
snapshots: retain latest N per match or all at period boundaries
command_deduplication: retain through match + audit period
```

Product Owner must confirm retention period before production.

---

## 22. AI Agent Forbidden Actions

AI agent must not:

```txt
- create mutable scoreboard_state as source of truth
- update or delete match_events
- bypass match_streams expectedSeq check
- write score/foul/clock directly to matches as official state
- trust client-calculated score/foul/clock
- skip command_deduplication
- skip audit_logs for correction
- add correction without reason
- make public scoreboard endpoints writable
- store passwords in plain text
- create tournament standings logic without TIEBREAK_RULES.md
- implement full foul penalty automation without FOUL_PENALTY_MATRIX.md
```

---

## 23. Required Tests

### Event store tests

```txt
- append first event seq 1
- append next event seq 2
- reject expectedSeq mismatch
- reject duplicate command with different hash
- return same result for duplicate command with same hash
- preserve unique(match_id, seq_no)
- prevent update/delete event at app layer
```

### Projection tests

```txt
- rebuild live scoreboard from events
- rebuild foul projection from events
- rebuild timeout projection from events
- rebuild replay timeline from events
- mark projection stale on rebuild failure
```

### Correction tests

```txt
- correction requires permission
- correction requires reason
- original event remains unchanged
- compensating event reverses effect
- corrected event applies new effect
- audit log stores old/new value
```

### Realtime polling tests

```txt
- client sync after lastEventSeq receives missedEvents
- client far behind receives fullSyncRequired
- public scoreboard receives read-only projection
- operator receives currentSeq
```

### Security tests

```txt
- viewer cannot submit match command
- public client cannot write
- scorer cannot operate unassigned match
- disabled user cannot access API
```

---

## 24. Acceptance Criteria

A database implementation is accepted only when:

```txt
- all required tables exist
- all match_events have unique event_id
- all match_events have unique(match_id, seq_no)
- live command writes event + projection + audit in transaction where possible
- correction never updates/deletes original event
- projections can be rebuilt from match_events
- snapshots are treated as optimization only
- RBAC tables support match-scoped permissions
- MariaDB/InnoDB is used for transactional tables
- public read endpoints cannot mutate data
```

---

## 25. Suggested Folder Structure

```txt
/database
  DATABASE_SCHEMA.md
  EVENT_STORE_SCHEMA.md
  SNAPSHOT_STRATEGY.md
  MIGRATION_POLICY.md

/migrations
  001_create_auth_tables.sql
  002_create_competition_tables.sql
  003_create_match_tables.sql
  004_create_event_store_tables.sql
  005_create_projection_tables.sql
  006_create_audit_tables.sql

/src/server/db
  connection.ts
  transaction.ts
  migrations.ts

/src/server/domain
  match/
  tournament/
  team/
  player/
  auth/

/src/server/event-store
  appendMatchEvent.ts
  loadMatchEvents.ts
  rebuildProjection.ts
```

---

## 26. Next Safe Implementation Step

[SYSTEM RECOMMENDATION] หลังจากไฟล์นี้ ขั้นตอนถัดไปคือสร้างไฟล์:

```txt
EVENT_STORE_SCHEMA.md
```

เพื่อแยกรายละเอียดเฉพาะของ:

```txt
match_streams
match_events
command_deduplication
append transaction
expectedSeq conflict handling
correction event sequence
event replay
```

หากต้องการให้เริ่ม scaffold database จริง ให้ AI agent เริ่มจาก migration เหล่านี้ก่อน:

```txt
001_create_auth_tables.sql
002_create_competition_tables.sql
003_create_match_tables.sql
004_create_event_store_tables.sql
005_create_projection_tables.sql
006_create_audit_tables.sql
```
