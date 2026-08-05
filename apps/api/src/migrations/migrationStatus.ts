import {
  discoverMigrationFiles,
  schemaMigrationsSql,
  type AppliedMigration,
  type DatabaseHealth,
  type MigrationConnection
} from "./migrationRunner.js";

export type MigrationStatus = {
  database: DatabaseHealth;
  discovered: Array<{ filename: string; checksum: string }>;
  applied: AppliedMigration[];
  pending: Array<{ filename: string; checksum: string }>;
  checksumMismatches: Array<{
    filename: string;
    appliedChecksum: string;
    discoveredChecksum: string;
  }>;
};

export async function getMigrationStatus(options: {
  migrationsDir?: string;
  connection: MigrationConnection;
}): Promise<MigrationStatus> {
  const migrations = await discoverMigrationFiles(options.migrationsDir);

  await options.connection.execute(schemaMigrationsSql);

  const [database, applied] = await Promise.all([
    options.connection.getDatabaseHealth(),
    options.connection.listAppliedMigrations()
  ]);
  const appliedByFilename = new Map(applied.map((migration) => [migration.filename, migration]));
  const pending: Array<{ filename: string; checksum: string }> = [];
  const checksumMismatches: MigrationStatus["checksumMismatches"] = [];

  for (const migration of migrations) {
    const appliedMigration = appliedByFilename.get(migration.filename);

    if (!appliedMigration) {
      pending.push({ filename: migration.filename, checksum: migration.checksum });
      continue;
    }

    if (appliedMigration.checksum !== migration.checksum) {
      checksumMismatches.push({
        filename: migration.filename,
        appliedChecksum: appliedMigration.checksum,
        discoveredChecksum: migration.checksum
      });
    }
  }

  return {
    database,
    discovered: migrations.map((migration) => ({
      filename: migration.filename,
      checksum: migration.checksum
    })),
    applied,
    pending,
    checksumMismatches
  };
}
