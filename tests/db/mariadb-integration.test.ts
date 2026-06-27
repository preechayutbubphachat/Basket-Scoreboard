import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { createDatabasePool } from "../../apps/api/src/db";
import { hasDatabaseEnv } from "../../apps/api/src/config/env";
import {
  MariaDbMigrationConnection,
  discoverMigrationFiles,
  getDefaultMigrationsDir,
  getMigrationStatus,
  runMigrations
} from "../../apps/api/src/migrations";

const describeDb = hasDatabaseEnv() ? describe : describe.skip;

describeDb("MariaDB integration verification", () => {
  it("connects, reports status, runs migrations, is idempotent, and detects checksum mismatch", async () => {
    const pool = createDatabasePool();
    const rawConnection = await pool.getConnection();
    const connection = new MariaDbMigrationConnection(rawConnection);

    try {
      const beforeStatus = await getMigrationStatus({
        migrationsDir: getDefaultMigrationsDir(),
        connection
      });

      expect(beforeStatus.database.connected).toBe(true);
      expect(beforeStatus.database.databaseName).toBe(process.env.DATABASE_NAME);
      expect(beforeStatus.discovered.length).toBeGreaterThan(0);

      const firstRun = await runMigrations({
        migrationsDir: getDefaultMigrationsDir(),
        connection
      });

      expect(firstRun.failed).toBeNull();

      const secondRun = await runMigrations({
        migrationsDir: getDefaultMigrationsDir(),
        connection
      });

      expect(secondRun.failed).toBeNull();
      expect(secondRun.applied).toEqual([]);
      expect(secondRun.skipped).toEqual(secondRun.discovered);

      const discovered = await discoverMigrationFiles(getDefaultMigrationsDir());
      const mismatchDir = join(tmpdir(), `basket-mismatch-${crypto.randomUUID()}`);
      mkdirSync(mismatchDir, { recursive: true });
      writeFileSync(
        join(mismatchDir, discovered[0]!.filename),
        `${discovered[0]!.sql}\n-- deliberate checksum mismatch\n`
      );

      try {
        const mismatchStatus = await getMigrationStatus({
          migrationsDir: mismatchDir,
          connection
        });

        expect(mismatchStatus.checksumMismatches).toHaveLength(1);
        expect(mismatchStatus.checksumMismatches[0]!.filename).toBe(discovered[0]!.filename);
      } finally {
        rmSync(mismatchDir, { recursive: true, force: true });
      }
    } finally {
      rawConnection.release();
      await pool.end();
    }
  });
});
