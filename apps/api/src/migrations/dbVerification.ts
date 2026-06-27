import type { DatabaseConfig } from "../config/env";
import type { MigrationStatus } from "./migrationStatus";

export type DbCheckReport = {
  database: {
    host: string;
    port: number;
    name: string;
    user: string;
    passwordConfigured: boolean;
    password?: never;
    connected: boolean;
    currentDatabase: string | null;
    schemaMigrationsExists: boolean;
    appliedMigrationCount: number;
  };
  migrations: {
    discovered: string[];
    applied: string[];
    pending: string[];
    checksumMismatches: MigrationStatus["checksumMismatches"];
  };
};

export function buildDbCheckReport(options: {
  config: DatabaseConfig;
  status: MigrationStatus;
}): DbCheckReport {
  return {
    database: {
      host: options.config.host,
      port: options.config.port,
      name: options.config.database,
      user: options.config.user,
      passwordConfigured: options.config.password.length > 0,
      connected: options.status.database.connected,
      currentDatabase: options.status.database.databaseName,
      schemaMigrationsExists: options.status.database.schemaMigrationsExists,
      appliedMigrationCount: options.status.database.migrationCount
    },
    migrations: {
      discovered: options.status.discovered.map((migration) => migration.filename),
      applied: options.status.applied.map((migration) => migration.filename),
      pending: options.status.pending.map((migration) => migration.filename),
      checksumMismatches: options.status.checksumMismatches
    }
  };
}
