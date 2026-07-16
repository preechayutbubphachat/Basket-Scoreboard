import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const componentSource = readFileSync("apps/web/src/components/PublicLiveScoreboard.tsx", "utf8");
const displayModelSource = readFileSync("apps/web/src/lib/publicScoreboardDisplay.ts", "utf8");
const styles = readFileSync("apps/web/src/styles.css", "utf8");

describe("public live scoreboard arena visual contract", () => {
  test("keeps score and clock colors fixed and broadcast safe", () => {
    expect(styles).toContain("--arena-score-color: var(--color-score, #f8fafc)");
    expect(styles).toContain("--arena-clock-color: var(--color-clock-game, #67e8f9)");
    expect(styles).toContain("--arena-warning-color: var(--color-clock-shot, #ef4444)");
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

  test("compacts public metadata into the header and recovers the separate grid row", () => {
    expect(componentSource).toContain('className={`arena-header${hasMatchMetadata ? " has-match-metadata" : ""}`}');
    expect(styles).toMatch(/\.arena-layout\.has-match-metadata\s*\{\s*grid-template-rows:\s*var\(--arena-header-h\) minmax\(0, 1fr\) var\(--arena-action-h\) var\(--arena-system-h\)/);
    expect(styles).toMatch(/\.arena-header\.has-match-metadata\s*\{[\s\S]*grid-template-rows:\s*minmax\(0, 1fr\) auto/);
    expect(styles).toMatch(/\.arena-match-metadata\s*\{[\s\S]*grid-column:\s*1 \/ -1[\s\S]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
    expect(styles).toMatch(/\.arena-match-metadata dd\s*\{[\s\S]*overflow:\s*hidden[\s\S]*text-overflow:\s*ellipsis[\s\S]*white-space:\s*nowrap/);
  });

  test("improves rail readability without changing P1 score or clock scale", () => {
    expect(styles).toContain("--arena-score-size: clamp(8.2rem, 28vh, 19rem)");
    expect(styles).toContain("--arena-game-clock-size: clamp(4.8rem, 16vh, 10.5rem)");
    expect(styles).toContain("--arena-shot-clock-size: clamp(3.6rem, 13vh, 8.2rem)");
    expect(styles).toMatch(/\.recent-event-ticker\s*\{[^}]*opacity:\s*0\.88/);
    expect(styles).toMatch(/\.kiosk-mode \.recent-event-ticker\s*\{[^}]*opacity:\s*0\.64/);
    expect(styles).toMatch(/\.compact-system-strip\s*\{[^}]*opacity:\s*0\.58/);
    expect(styles).toMatch(/\.kiosk-mode \.compact-system-strip\s*\{[^}]*opacity:\s*0\.5/);
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
