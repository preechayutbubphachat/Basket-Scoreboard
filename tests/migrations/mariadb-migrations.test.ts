import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDir = join(process.cwd(), "migrations");

function readMigration(fileName: string) {
  return readFileSync(join(migrationsDir, fileName), "utf8");
}

function compact(sql: string) {
  return sql.replace(/\s+/g, " ").toLowerCase();
}

describe("MariaDB migration foundation", () => {
  it("keeps migration files ordered by version", () => {
    expect(readdirSync(migrationsDir).filter((file) => file.endsWith(".sql"))).toEqual([
      "001_create_auth_tables.sql",
      "002_create_competition_tables.sql",
      "003_create_match_tables.sql",
      "004_create_event_store_tables.sql",
      "005_create_projection_tables.sql",
      "006_create_audit_tables.sql"
    ]);
  });

  it("creates required MVP tables with MariaDB InnoDB settings", () => {
    const allSql = compact(
      readdirSync(migrationsDir)
        .filter((file) => file.endsWith(".sql"))
        .map(readMigration)
        .join("\n")
    );

    for (const tableName of [
      "users",
      "roles",
      "permissions",
      "user_roles",
      "tournaments",
      "teams",
      "players",
      "matches",
      "match_streams",
      "match_events",
      "command_deduplication",
      "match_projections",
      "audit_logs"
    ]) {
      expect(allSql).toContain(`create table if not exists ${tableName}`);
    }

    expect(allSql).toContain("engine=innodb");
    expect(allSql).toContain("default charset=utf8mb4");
    expect(allSql).not.toContain("serial");
    expect(allSql).not.toContain("jsonb");
  });

  it("defines the critical append-only event store columns and constraints", () => {
    const eventStoreSql = compact(readMigration("004_create_event_store_tables.sql"));

    for (const columnName of [
      "event_id",
      "match_id",
      "seq_no",
      "event_type",
      "payload json",
      "actor_user_id",
      "actor_role",
      "device_id",
      "occurred_at",
      "recorded_at",
      "command_id",
      "expected_seq",
      "correlation_id",
      "causation_id",
      "reason",
      "rule_profile_id"
    ]) {
      expect(eventStoreSql).toContain(columnName);
    }

    expect(eventStoreSql).toContain("unique key uq_match_events_event_id");
    expect(eventStoreSql).toContain("unique key uq_match_events_match_seq");
    expect(eventStoreSql).toContain("unique key uq_match_events_match_command");
    expect(eventStoreSql).toContain("unique key uq_command_deduplication_match_command");
    expect(eventStoreSql).toContain("last_seq_no");
    expect(eventStoreSql).toContain("idx_match_events_match_seq");
  });

  it("stores projections and audit traces outside match_events", () => {
    const projectionSql = compact(readMigration("005_create_projection_tables.sql"));
    const auditSql = compact(readMigration("006_create_audit_tables.sql"));

    expect(projectionSql).toContain("create table if not exists match_projections");
    expect(projectionSql).toContain("projection_data json");
    expect(projectionSql).toContain("last_event_seq");
    expect(projectionSql).toContain("unique key uq_match_projections_match_type");

    for (const columnName of [
      "audit_id",
      "entity_type",
      "entity_id",
      "action",
      "actor_user_id",
      "actor_role",
      "device_id",
      "old_value json",
      "new_value json",
      "reason",
      "correlation_id",
      "causation_id",
      "event_seq",
      "created_at"
    ]) {
      expect(auditSql).toContain(columnName);
    }
  });
});
