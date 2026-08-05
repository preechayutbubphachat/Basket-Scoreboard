import { loadServerEnv } from "../config/loadEnv.js";
import { createDatabasePool } from "../db.js";
import { createOrUpdateAdmin } from "./authBootstrap.js";

loadServerEnv();

const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;
const displayName = process.env.ADMIN_DISPLAY_NAME;

if (!email || !password || !displayName) {
  throw new Error("ADMIN_EMAIL, ADMIN_PASSWORD, and ADMIN_DISPLAY_NAME are required");
}

const pool = createDatabasePool();

try {
  await createOrUpdateAdmin(pool, { email, password, displayName });
  console.log(`admin user created or updated for ${email}`);
} finally {
  await pool.end();
}
