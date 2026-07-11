import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const componentSource = readFileSync("apps/web/src/components/PublicLiveScoreboard.tsx", "utf8");
const displayModelSource = readFileSync("apps/web/src/lib/publicScoreboardDisplay.ts", "utf8");
const styles = readFileSync("apps/web/src/styles.css", "utf8");

describe("public live scoreboard arena visual contract", () => {
  test("keeps score and clock colors fixed and broadcast safe", () => {
    expect(styles).toContain("--arena-score-color: #f8fafc");
    expect(styles).toContain("--arena-clock-color: #67e8f9");
    expect(styles).toContain("--arena-warning-color: #ef4444");
    expect(styles).toMatch(/\.public-display-score-value[\s\S]*font-variant-numeric:\s*tabular-nums/);
    expect(styles).toMatch(/\.public-display-score-value[\s\S]*white-space:\s*nowrap/);
    expect(styles).toMatch(/\.public-display-team h2[\s\S]*-webkit-line-clamp:\s*2/);
  });

  test("uses height-aware layout and reduced-motion rules", () => {
    expect(styles).toContain("--arena-clock-column");
    expect(styles).toMatch(/@media \(max-height: 700px\) and \(min-width: 761px\)/);
    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
    expect(styles).toContain("--arena-score-size: clamp(");
  });

  test("uses safe monogram fallback and omits UUID-derived broadcast codes", () => {
    expect(componentSource).toContain("public-display-team-watermark");
    expect(componentSource).toContain("team.monogram");
    expect(displayModelSource).toContain("matchCodeLabel: null");
    expect(componentSource).not.toContain("matchCodeLabel");
  });

  test("does not derive bonus or fabricate recent activity", () => {
    expect(componentSource).toContain('className="arena-neutral-value">--');
    expect(componentSource).not.toMatch(/fouls\s*[><=]+\s*\d+/);
    expect(displayModelSource).toContain('recentEventTicker: "No public play updates available."');
    expect(componentSource).not.toMatch(/SCORE_ADDED|FOUL_ADDED|TIMEOUT_GRANTED|POSSESSION/);
  });

  test("keeps public components free from private operational structures", () => {
    expect(componentSource).not.toMatch(/homeTeamId|awayTeamId|playerId|playerFouls|roster|currentSeq|lastEventSeq|commandId|correlationId|audit|correction|actor|session|csrf/i);
  });
});
