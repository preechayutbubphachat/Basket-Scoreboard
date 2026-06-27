import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createDatabasePool } from "./db";

const migrationsDir = resolve(process.cwd(), "../../migrations");

async function runMigrations() {
  const pool = createDatabasePool();
  const connection = await pool.getConnection();

  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    const files = (await readdir(migrationsDir))
      .filter((file) => file.endsWith(".sql"))
      .sort();

    for (const file of files) {
      const [rows] = await connection.query(
        "SELECT filename FROM schema_migrations WHERE filename = ?",
        [file]
      );

      if (Array.isArray(rows) && rows.length > 0) {
        continue;
      }

      const sql = await readFile(resolve(migrationsDir, file), "utf8");
      await connection.beginTransaction();
      await connection.query(sql);
      await connection.query(
        "INSERT INTO schema_migrations (filename) VALUES (?)",
        [file]
      );
      await connection.commit();
    }
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
    await pool.end();
  }
}

await runMigrations();
