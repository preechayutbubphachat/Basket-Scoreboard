import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { calculateSha256 } from "./checksum.js";

export type MigrationFile = {
  filename: string;
  path: string;
  sql: string;
  checksum: string;
};

export type AppliedMigration = {
  filename: string;
  checksum: string;
  appliedAt: Date;
  executionMs: number;
};

export type DatabaseHealth = {
  connected: boolean;
  databaseName: string | null;
  schemaMigrationsExists: boolean;
  migrationCount: number;
};

export type MigrationConnection = {
  execute(sql: string, values?: unknown[]): Promise<unknown>;
  beginTransaction(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  listAppliedMigrations(): Promise<AppliedMigration[]>;
  markMigrationApplied(record: {
    filename: string;
    checksum: string;
    executionMs: number;
  }): Promise<void>;
  getDatabaseHealth(): Promise<DatabaseHealth>;
};

export type MigrationRunResult = {
  discovered: string[];
  applied: string[];
  skipped: string[];
  failed: { filename: string; error: Error } | null;
  timings: Array<{ filename: string; executionMs: number }>;
};

export class ChecksumMismatchError extends Error {
  constructor(
    readonly filename: string,
    readonly appliedChecksum: string,
    readonly discoveredChecksum: string
  ) {
    super(
      `Migration checksum mismatch for ${filename}: applied=${appliedChecksum} discovered=${discoveredChecksum}`
    );
    this.name = "ChecksumMismatchError";
  }
}

export const schemaMigrationsSql = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  id BIGINT NOT NULL AUTO_INCREMENT,
  filename VARCHAR(255) NOT NULL,
  checksum CHAR(64) NOT NULL,
  applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  execution_ms INT NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_schema_migrations_filename (filename)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

export function resolveMigrationsDir(startDir = process.cwd()) {
  let currentDir = resolve(startDir);

  while (true) {
    const candidate = join(currentDir, "migrations");

    if (existsSync(candidate)) {
      return candidate;
    }

    const parentDir = resolve(currentDir, "..");

    if (parentDir === currentDir) {
      return candidate;
    }

    currentDir = parentDir;
  }
}

export function getDefaultMigrationsDir() {
  return resolveMigrationsDir();
}

export async function discoverMigrationFiles(migrationsDir = getDefaultMigrationsDir()) {
  let entries: string[];

  try {
    entries = await readdir(migrationsDir);
  } catch (error) {
    throw new Error(`Migrations directory not found: ${migrationsDir}`, { cause: error });
  }

  const sqlFiles = entries.filter((entry) => entry.endsWith(".sql")).sort();
  const migrations: MigrationFile[] = [];

  for (const filename of sqlFiles) {
    const path = join(migrationsDir, filename);
    const sql = await readFile(path, "utf8");
    migrations.push({
      filename,
      path,
      sql,
      checksum: calculateSha256(sql)
    });
  }

  return migrations;
}

export async function runMigrations(options: {
  migrationsDir?: string;
  connection: MigrationConnection;
  logger?: Pick<Console, "log" | "error">;
}): Promise<MigrationRunResult> {
  const logger = options.logger;
  const migrations = await discoverMigrationFiles(options.migrationsDir);
  const result: MigrationRunResult = {
    discovered: migrations.map((migration) => migration.filename),
    applied: [],
    skipped: [],
    failed: null,
    timings: []
  };

  await options.connection.execute(schemaMigrationsSql);
  const appliedByFilename = new Map(
    (await options.connection.listAppliedMigrations()).map((migration) => [
      migration.filename,
      migration
    ])
  );

  for (const migration of migrations) {
    const appliedMigration = appliedByFilename.get(migration.filename);

    if (appliedMigration) {
      if (appliedMigration.checksum !== migration.checksum) {
        throw new ChecksumMismatchError(
          migration.filename,
          appliedMigration.checksum,
          migration.checksum
        );
      }

      result.skipped.push(migration.filename);
      logger?.log(`migration ${migration.filename} skipped`);
      continue;
    }

    const startedAt = Date.now();

    try {
      await options.connection.beginTransaction();
      await options.connection.execute(migration.sql);
      const executionMs = Date.now() - startedAt;
      await options.connection.markMigrationApplied({
        filename: migration.filename,
        checksum: migration.checksum,
        executionMs
      });
      await options.connection.commit();
      result.applied.push(migration.filename);
      result.timings.push({ filename: migration.filename, executionMs });
      logger?.log(`migration ${migration.filename} applied in ${executionMs}ms`);
    } catch (error) {
      await options.connection.rollback();
      const normalizedError = error instanceof Error ? error : new Error(String(error));
      result.failed = { filename: migration.filename, error: normalizedError };
      logger?.error(`migration ${migration.filename} failed: ${normalizedError.message}`);
      return result;
    }
  }

  return result;
}

type SchemaMigrationRow = RowDataPacket & {
  filename: string;
  checksum: string;
  applied_at: Date;
  execution_ms: number;
};

type DatabaseRow = RowDataPacket & {
  database_name: string | null;
};

type CountRow = RowDataPacket & {
  count: number;
};

export class MariaDbMigrationConnection implements MigrationConnection {
  constructor(private readonly connection: PoolConnection) {}

  async execute(sql: string, values?: unknown[]) {
    await this.connection.query(sql, values);
  }

  async beginTransaction() {
    await this.connection.beginTransaction();
  }

  async commit() {
    await this.connection.commit();
  }

  async rollback() {
    await this.connection.rollback();
  }

  async listAppliedMigrations() {
    const [rows] = await this.connection.query<SchemaMigrationRow[]>(
      "SELECT filename, checksum, applied_at, execution_ms FROM schema_migrations ORDER BY filename ASC"
    );

    return rows.map((row) => ({
      filename: row.filename,
      checksum: row.checksum,
      appliedAt: row.applied_at,
      executionMs: row.execution_ms
    }));
  }

  async markMigrationApplied(record: {
    filename: string;
    checksum: string;
    executionMs: number;
  }) {
    await this.connection.query(
      "INSERT INTO schema_migrations (filename, checksum, execution_ms) VALUES (?, ?, ?)",
      [record.filename, record.checksum, record.executionMs]
    );
  }

  async getDatabaseHealth(): Promise<DatabaseHealth> {
    const [databaseRows] = await this.connection.query<DatabaseRow[]>(
      "SELECT DATABASE() AS database_name"
    );
    const [tableRows] = await this.connection.query<CountRow[]>(
      "SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'schema_migrations'"
    );
    const schemaMigrationsExists = Number(tableRows[0]?.count ?? 0) > 0;
    let migrationCount = 0;

    if (schemaMigrationsExists) {
      const [migrationRows] = await this.connection.query<CountRow[]>(
        "SELECT COUNT(*) AS count FROM schema_migrations"
      );
      migrationCount = Number(migrationRows[0]?.count ?? 0);
    }

    return {
      connected: true,
      databaseName: databaseRows[0]?.database_name ?? null,
      schemaMigrationsExists,
      migrationCount
    };
  }
}
