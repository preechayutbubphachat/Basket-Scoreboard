import mysql from "mysql2/promise";
import { getDatabaseConfig } from "./config/env";

export function createDatabasePool() {
  const config = getDatabaseConfig();

  return mysql.createPool({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    waitForConnections: true,
    connectionLimit: 10,
    multipleStatements: true,
    namedPlaceholders: true
  });
}
