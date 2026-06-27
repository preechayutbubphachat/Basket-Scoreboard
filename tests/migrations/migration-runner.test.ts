import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  ChecksumMismatchError,
  discoverMigrationFiles,
  getMigrationStatus,
  runMigrations,
  type MigrationConnection
} from "../../apps/api/src/migrations";
import { calculateSha256 } from "../../apps/api/src/migrations/checksum";

class FakeMigrationConnection implements MigrationConnection {
  applied = new Map<string, { checksum: string; appliedAt: Date; executionMs: number }>();
  executedSql: string[] = [];
  inserted: string[] = [];
  failOnSqlIncludes?: string;

  async execute(sql: string): Promise<void> {
    this.executedSql.push(sql);

    if (this.failOnSqlIncludes && sql.includes(this.failOnSqlIncludes)) {
      throw new Error("forced migration failure");
    }
  }

  async beginTransaction(): Promise<void> {
    return;
  }

  async commit(): Promise<void> {
    return;
  }

  async rollback(): Promise<void> {
    return;
  }

  async listAppliedMigrations() {
    return Array.from(this.applied.entries()).map(([filename, migration]) => ({
      filename,
      checksum: migration.checksum,
      appliedAt: migration.appliedAt,
      executionMs: migration.executionMs
    }));
  }

  async markMigrationApplied(record: {
    filename: string;
    checksum: string;
    executionMs: number;
  }): Promise<void> {
    this.inserted.push(record.filename);
    this.applied.set(record.filename, {
      checksum: record.checksum,
      appliedAt: new Date(),
      executionMs: record.executionMs
    });
  }

  async getDatabaseHealth() {
    return {
      connected: true,
      databaseName: "test_db",
      schemaMigrationsExists: true,
      migrationCount: this.applied.size
    };
  }
}

function makeTempMigrations(files: Record<string, string>) {
  const dir = join(tmpdir(), `basket-migrations-${crypto.randomUUID()}`);
  mkdirSync(dir, { recursive: true });

  for (const [filename, sql] of Object.entries(files)) {
    writeFileSync(join(dir, filename), sql);
  }

  return dir;
}

describe("migration runner", () => {
  it("discovers migration files in filename order", async () => {
    const dir = makeTempMigrations({
      "002_second.sql": "SELECT 2;",
      "001_first.sql": "SELECT 1;",
      "notes.txt": "ignored"
    });

    try {
      const files = await discoverMigrationFiles(dir);

      expect(files.map((file) => file.filename)).toEqual([
        "001_first.sql",
        "002_second.sql"
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("calculates SHA-256 checksums", () => {
    expect(calculateSha256("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
  });

  it("skips already-applied migrations with the same checksum", async () => {
    const dir = makeTempMigrations({ "001_done.sql": "SELECT 1;" });
    const [file] = await discoverMigrationFiles(dir);
    const connection = new FakeMigrationConnection();
    connection.applied.set("001_done.sql", {
      checksum: file.checksum,
      appliedAt: new Date(),
      executionMs: 5
    });

    try {
      const result = await runMigrations({ migrationsDir: dir, connection });

      expect(result).toMatchObject({
        applied: [],
        skipped: ["001_done.sql"],
        failed: null
      });
      expect(connection.inserted).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("detects checksum mismatch for an already-applied filename", async () => {
    const dir = makeTempMigrations({ "001_changed.sql": "SELECT 1;" });
    const connection = new FakeMigrationConnection();
    connection.applied.set("001_changed.sql", {
      checksum: "0".repeat(64),
      appliedAt: new Date(),
      executionMs: 5
    });

    await expect(runMigrations({ migrationsDir: dir, connection })).rejects.toBeInstanceOf(
      ChecksumMismatchError
    );

    rmSync(dir, { recursive: true, force: true });
  });

  it("does not mark a failed migration as applied", async () => {
    const dir = makeTempMigrations({ "001_fail.sql": "SELECT 'FAIL';" });
    const connection = new FakeMigrationConnection();
    connection.failOnSqlIncludes = "FAIL";

    try {
      const result = await runMigrations({ migrationsDir: dir, connection });

      expect(result.failed).toMatchObject({ filename: "001_fail.sql" });
      expect(result.applied).toEqual([]);
      expect(connection.inserted).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("handles a missing migrations folder safely", async () => {
    await expect(discoverMigrationFiles(join(tmpdir(), crypto.randomUUID()))).rejects.toThrow(
      "Migrations directory not found"
    );
  });

  it("returns migration status with applied and pending lists", async () => {
    const dir = makeTempMigrations({
      "001_done.sql": "SELECT 1;",
      "002_pending.sql": "SELECT 2;"
    });
    const files = await discoverMigrationFiles(dir);
    const connection = new FakeMigrationConnection();
    connection.applied.set("001_done.sql", {
      checksum: files[0]!.checksum,
      appliedAt: new Date(),
      executionMs: 5
    });

    try {
      const status = await getMigrationStatus({ migrationsDir: dir, connection });

      expect(status.database.connected).toBe(true);
      expect(status.discovered.map((file) => file.filename)).toEqual([
        "001_done.sql",
        "002_pending.sql"
      ]);
      expect(status.applied.map((file) => file.filename)).toEqual(["001_done.sql"]);
      expect(status.pending.map((file) => file.filename)).toEqual(["002_pending.sql"]);
      expect(status.checksumMismatches).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
