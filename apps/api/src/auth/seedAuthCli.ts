import { loadServerEnv } from "../config/loadEnv.js";
import { createDatabasePool } from "../db.js";
import { seedAuth } from "./authBootstrap.js";

loadServerEnv();

const pool = createDatabasePool();

try {
  await seedAuth(pool);
  console.log("auth seed completed");
} finally {
  await pool.end();
}
