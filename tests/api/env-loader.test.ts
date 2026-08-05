import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("server env loader", () => {
  it("loads a root .env without overriding existing process env values", () => {
    const loader = readFileSync(join(process.cwd(), "apps/api/src/config/loadEnv.ts"), "utf8");

    expect(loader).toContain('from "dotenv"');
    expect(loader).toContain("override: false");
    expect(loader).toContain("quiet: true");
    expect(loader).toContain('path.join(current, ".env")');
    expect(loader).not.toContain("DATABASE_PASSWORD");
  });

  it("runs before API and migration startup code reads database env", () => {
    const index = readFileSync(join(process.cwd(), "apps/api/src/index.ts"), "utf8");
    const server = readFileSync(join(process.cwd(), "apps/api/src/server.ts"), "utf8");
    const migrate = readFileSync(join(process.cwd(), "apps/api/src/migrate.ts"), "utf8");

    expect(index.indexOf("loadServerEnv();")).toBeLessThan(index.indexOf("process.env.PORT"));
    expect(server.indexOf("loadServerEnv();")).toBeLessThan(server.indexOf("process.env.PORT"));
    expect(migrate.indexOf("loadServerEnv();")).toBeLessThan(migrate.indexOf("hasDatabaseEnv()"));
  });
});
