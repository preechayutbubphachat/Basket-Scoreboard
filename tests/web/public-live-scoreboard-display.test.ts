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
    expect(styles).toMatch(/@media \(max-height: 620px\) and \(min-aspect-ratio: 16 \/ 10\)/);
    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
    expect(styles).toContain("--arena-score-size: clamp(");
  });

  test("fits the arena frame to both viewport axes without body-level clipping", () => {
    expect(styles).toContain("--public-display-inset: 20px");
    expect(styles).toContain("height: 100dvh");
    expect(styles).toMatch(/height:\s*min\([\s\S]*100dvh[\s\S]*9 \/ 16/);
    expect(styles).toMatch(/width:\s*min\([\s\S]*100dvh[\s\S]*16 \/ 9/);
    expect(styles).toMatch(/\.arena-scoreboard-grid,[\s\S]*\.recent-event-ticker\s*\{[\s\S]*min-height:\s*0/);
    expect(styles).toMatch(/\.public-display-scene-frame\s*\{\s*grid-template-rows:\s*minmax\(0, 1fr\)/);
    expect(styles).not.toMatch(/html\s*,?\s*body[\s\S]*overflow:\s*hidden/);
  });

  test("keeps compact team names bounded to two readable lines", () => {
    expect(styles).toMatch(/\.public-display-team h2[\s\S]*-webkit-line-clamp:\s*2/);
    expect(styles).toMatch(/\.public-display-team h2[\s\S]*max-height:\s*2\.04em/);
    expect(styles).toMatch(/\.public-display-team h2[\s\S]*overflow-wrap:\s*break-word/);
    expect(styles).toMatch(/\.public-display-team h2[\s\S]*word-break:\s*normal/);
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
    expect(displayModelSource).toContain('recentEventTicker: options.recentActionDisplay?.text ?? "No public play updates available."');
    expect(componentSource).not.toMatch(/SCORE_ADDED|FOUL_ADDED|TIMEOUT_GRANTED|POSSESSION/);
  });

  test("keeps public components free from private operational structures", () => {
    expect(componentSource).not.toMatch(/homeTeamId|awayTeamId|playerId|playerFouls|roster|currentSeq|lastEventSeq|commandId|correlationId|audit|correction|actor|session|csrf/i);
  });
});
