import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("RM-08 P1A migration contract", () => {
  it("keeps roster baseline snapshots additive and event-store history untouched", () => {
    const sql = readFileSync("migrations/017_create_match_roster_baseline_snapshots.sql", "utf8").replace(/\s+/g, " ").toLowerCase();
    expect(sql).toContain("create table if not exists match_roster_baseline_snapshots");
    expect(sql).toContain("projection_data json not null");
    expect(sql).not.toContain(["update", "match_events"].join(" "));
    expect(sql).not.toContain(["delete", "from", "match_events"].join(" "));
    expect(sql).not.toContain(["truncate", "match_events"].join(" "));
  });
});
