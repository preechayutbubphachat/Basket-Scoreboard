import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("RM-06 assistant-coach B mounted surface", () => {
  it("uses protected REST commands and keeps the UI limited to the Assistant Coach B workflow", () => {
    const app = readFileSync(resolve(process.cwd(), "apps/web/src/App.tsx"), "utf8");
    const api = readFileSync(resolve(process.cwd(), "apps/web/src/lib/apiClient.ts"), "utf8");
    expect(app).toContain("Assistant coach bench technical");
    expect(app).toContain("Create assistant coach designation");
    expect(app).toContain("api.recordAssistantCoachBenchTechnicalFoul(matchId");
    expect(api).toContain("/commands/foul/assistant-coach/bench-technical");
    expect(api).not.toContain("/commands/foul/bench/");
    expect(app).not.toContain("assistantCoachBenchTechnicals");
  });
});
