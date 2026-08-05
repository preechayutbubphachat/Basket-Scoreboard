import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const syncSource = readFileSync("apps/api/src/matchEventStore/syncService.ts", "utf8");
const realtimeSource = readFileSync("apps/api/src/realtime/projectionRealtime.ts", "utf8");

describe("RM-08 P1A roster baseline sync/reconnect boundary", () => {
  it("keeps the existing sequence-bearing protected sync and disables socket commands", () => {
    expect(syncSource).toContain("lastEventSeq");
    expect(syncSource).toContain("currentSeq");
    expect(realtimeSource).toContain("match:operator-snapshot");
    expect(realtimeSource).toContain("Socket commands are disabled");
    expect(realtimeSource).toContain("roster-baseline:${view}-snapshot");
    expect(realtimeSource).toContain("roster-baseline:protected-updated");
    expect(realtimeSource).toContain("roster-baseline:public-updated");
  });
});
