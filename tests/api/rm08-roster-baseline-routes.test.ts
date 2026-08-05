import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const routeSource = readFileSync("apps/api/src/routes/rosterRoutes.ts", "utf8");
const serviceSource = readFileSync("apps/api/src/rosters/rosterBaselineService.ts", "utf8");

describe("RM-08 P1A roster baseline routes", () => {
  it("accepts only teamSide in the import body and derives command concurrency from headers", () => {
    expect(routeSource).toContain("Object.keys(body).length !== 1");
    expect(routeSource).toContain("x-expected-seq");
    expect(routeSource).toContain("idempotency-key");
    expect(routeSource).toContain("importRosterBaseline");
  });

  it("quarantines all generic PATCH lineup-critical fields with the locked 409 code", () => {
    expect(routeSource).toContain("LINEUP_CRITICAL_FIELD_REQUIRES_EXPLICIT_COMMAND");
    for (const field of ["roster_status", "is_starter", "is_captain", "confirmation", "readiness", "roster_version", "lock_state"]) {
      expect(routeSource).toContain(`\"${field}\"`);
    }
  });

  it("keeps the durable event, projections, snapshot, receipt and audit in one transaction", () => {
    for (const statement of ["beginTransaction", "INSERT INTO match_events", "UPDATE match_streams", "upsertProjection", "match_roster_baseline_snapshots", "command_deduplication", "insertAuditLog", "connection.commit", "connection.rollback"]) {
      expect(serviceSource).toContain(statement);
    }
  });
});
