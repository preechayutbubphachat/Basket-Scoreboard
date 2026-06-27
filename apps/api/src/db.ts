import mysql from "mysql2/promise";

export function createDatabasePool() {
  return mysql.createPool({
    host: process.env.DATABASE_HOST ?? "localhost",
    port: Number(process.env.DATABASE_PORT ?? 3306),
    database: process.env.DATABASE_NAME ?? "basketball_scoreboard",
    user: process.env.DATABASE_USER ?? "root",
    password: process.env.DATABASE_PASSWORD ?? "",
    waitForConnections: true,
    connectionLimit: 10,
    multipleStatements: true,
    namedPlaceholders: true
  });
}
