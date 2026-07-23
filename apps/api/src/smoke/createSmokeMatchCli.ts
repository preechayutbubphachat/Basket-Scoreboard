import { loadServerEnv } from "../config/loadEnv.js";
import { createDatabasePool } from "../db.js";
import { createOrReuseSmokeMatch, printSmokeMatchResult } from "./smokeMatch.js";

loadServerEnv();

const pool = createDatabasePool();

try {
  const result = await createOrReuseSmokeMatch({ pool });
  printSmokeMatchResult(result);
} finally {
  await pool.end();
}
