import { describe, expect, it } from "vitest";
import { getDatabaseConfig } from "../../apps/api/src/config/env";
import { buildDbCheckReport } from "../../apps/api/src/migrations/dbVerification";

describe("DB verification reporting", () => {
  it("does not expose database passwords in check output", () => {
    const config = getDatabaseConfig({
      DATABASE_HOST: "localhost",
      DATABASE_PORT: "3306",
      DATABASE_NAME: "basketball_scoreboard",
      DATABASE_USER: "root",
      DATABASE_PASSWORD: "super-secret"
    } as NodeJS.ProcessEnv);

    const report = buildDbCheckReport({
      config,
      status: {
        database: {
          connected: true,
          databaseName: "basketball_scoreboard",
          schemaMigrationsExists: true,
          migrationCount: 6
        },
        discovered: [{ filename: "001_create_auth_tables.sql", checksum: "a".repeat(64) }],
        applied: [],
        pending: [{ filename: "001_create_auth_tables.sql", checksum: "a".repeat(64) }],
        checksumMismatches: []
      }
    });

    expect(JSON.stringify(report)).not.toContain("super-secret");
    expect(report.database.passwordConfigured).toBe(true);
    expect(report.database.password).toBeUndefined();
  });
});
