import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync("apps/web/src/App.tsx", "utf8");
const lineupStart = appSource.indexOf("function AdminLineupPage");
const lineupEnd = appSource.indexOf("function HomePage", lineupStart);
const lineupPage = appSource.slice(lineupStart, lineupEnd);
const disclosureStart = lineupPage.indexOf('<aside className="panel" aria-label="Unified lineup status and disclosure">');
const disclosureEnd = lineupPage.indexOf("</aside>", disclosureStart) + "</aside>".length;
const disclosure = lineupPage.slice(disclosureStart, disclosureEnd);

if (lineupStart < 0 || lineupEnd < 0 || disclosureStart < 0 || disclosureEnd <= disclosureStart) {
  throw new Error("RM04 source boundaries are missing");
}

describe("RM04 unified lineup dashboard", () => {
  it("presents readiness and governing eligibility as separate source-neutral states", () => {
    expect(disclosure).toContain("Operational readiness is separate from governing eligibility.");
    expect(disclosure).toContain("Operational readiness");
    expect(disclosure).toContain("Governing eligibility");
    expect(disclosure).toContain("Governing source");
    expect(disclosure).toContain("NOT_ACCEPTED / UNVERIFIED");
    expect(disclosure).toContain("not evaluated");
    expect(disclosure).toContain("No official rule claim is made");
  });

  it("binds the dashboard to the existing read contract and keeps actions server-authorized", () => {
    expect(lineupPage).toContain("useState<MatchLineupResponse | null>");
    expect(lineupPage).toContain("api.getMatchLineup(matchId)");
    expect(disclosure).toContain("existing MatchLineupResponse contract");
    expect(disclosure).toContain("actions remain only server-authorized");
    expect(lineupPage).toContain("api.selectLineupStarter(matchId, teamSide, player.playerId)");
    expect(lineupPage).toContain("api.removeLineupStarter(matchId, teamSide, player.playerId)");
    expect(lineupPage).toContain("api.confirmLineupRoster(matchId, teamSide, \"alpha lineup\")");
    expect(disclosure).not.toMatch(/api\.|setLineup|useState.*(?:lock|correction)/i);
    expect(disclosure).toMatch(/No client-only unlock or correction is offered/);
    expect(disclosure).toContain("does not create duplicate truth");
  });

  it("preserves the RM12 replay route and read-only replay references", () => {
    const routeArea = appSource.slice(appSource.indexOf("case \"admin-lineup\""), appSource.indexOf("case \"admin-audit-log\""));
    const replayBlock = appSource.slice(appSource.indexOf("function MatchReplayPage"), appSource.indexOf("function MatchAuditLogPage"));
    expect(routeArea).toContain('<AdminLineupPage matchId={route.matchId} />');
    expect(routeArea).toContain('<MatchReplayPage matchId={route.matchId} backHref="/admin/matches" />');
    expect(replayBlock).toContain("Read-only replay. Controls change only this browser view.");
    expect(replayBlock).toContain("api.getMatchReplay(matchId, { group: nextGroup, limit: 300 })");
    expect(replayBlock).not.toMatch(/api\.(post|put|patch|delete|unlock|correct|update|save|send|dispatch)/i);
  });
});
