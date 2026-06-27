import { createDatabasePool } from "./db";
import {
  MariaDbMigrationConnection,
  buildDbCheckReport,
  getDefaultMigrationsDir,
  getMigrationStatus,
  runMigrations
} from "./migrations";
import { getDatabaseConfig, hasDatabaseEnv } from "./config/env";

const command = process.argv[2] ?? "run";

async function withMigrationConnection<T>(
  callback: (connection: MariaDbMigrationConnection) => Promise<T>
) {
  const pool = createDatabasePool();
  const connection = await pool.getConnection();
  const migrationConnection = new MariaDbMigrationConnection(connection);

  try {
    return await callback(migrationConnection);
  } finally {
    connection.release();
    await pool.end();
  }
}

if (!hasDatabaseEnv()) {
  throw new Error(
    "Database environment is not fully configured. Set DATABASE_HOST, DATABASE_PORT, DATABASE_NAME, DATABASE_USER, and DATABASE_PASSWORD."
  );
}

if (command === "status") {
  const status = await withMigrationConnection((connection) =>
    getMigrationStatus({ migrationsDir: getDefaultMigrationsDir(), connection })
  );

  console.log(JSON.stringify(status, null, 2));
} else if (command === "check") {
  const status = await withMigrationConnection((connection) =>
    getMigrationStatus({ migrationsDir: getDefaultMigrationsDir(), connection })
  );
  const report = buildDbCheckReport({
    config: getDatabaseConfig(),
    status
  });

  console.log(JSON.stringify(report, null, 2));
} else if (command === "run") {
  const result = await withMigrationConnection((connection) =>
    runMigrations({
      migrationsDir: getDefaultMigrationsDir(),
      connection,
      logger: console
    })
  );

  if (result.failed) {
    process.exitCode = 1;
  }
} else {
  throw new Error(`Unknown migration command: ${command}`);
}
