import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const mainSource = readFileSync("apps/web/src/main.tsx", "utf8");
const tokens = readFileSync("apps/web/src/styles/tokens.css", "utf8");
const primitives = readFileSync("apps/web/src/styles/primitives.css", "utf8");

const requiredSemanticTokens = [
  "--color-canvas",
  "--color-surface",
  "--color-surface-elevated",
  "--color-surface-muted",
  "--color-border",
  "--color-border-strong",
  "--color-text-primary",
  "--color-text-secondary",
  "--color-text-muted",
  "--color-focus",
  "--color-informational",
  "--color-success",
  "--color-warning",
  "--color-danger",
  "--color-offline",
  "--color-home-accent",
  "--color-away-accent",
  "--color-score",
  "--color-clock-game",
  "--color-clock-shot",
  "--font-ui",
  "--font-display",
  "--font-mono",
  "--text-label",
  "--text-body",
  "--text-title",
  "--text-score",
  "--text-game-clock",
  "--text-shot-clock",
  "--motion-fast",
  "--motion-normal",
  "--motion-scene"
] as const;

describe("shared design token contract", () => {
  test("loads tokens before primitives and legacy application styles", () => {
    const tokenIndex = mainSource.indexOf('import "./styles/tokens.css"');
    const primitiveIndex = mainSource.indexOf('import "./styles/primitives.css"');
    const applicationIndex = mainSource.indexOf('import "./styles.css"');

    expect(tokenIndex).toBeGreaterThan(-1);
    expect(primitiveIndex).toBeGreaterThan(tokenIndex);
    expect(applicationIndex).toBeGreaterThan(primitiveIndex);
  });

  test.each(requiredSemanticTokens)("defines %s", (token) => {
    expect(tokens).toMatch(new RegExp(`${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:`));
  });

  test("keeps semantic score and clocks independent from team accents", () => {
    expect(tokens).toContain("--color-score: var(--palette-slate-50)");
    expect(tokens).toContain("--color-clock-game: var(--palette-cyan-300)");
    expect(tokens).toContain("--color-clock-shot: var(--palette-red-500)");
    expect(tokens).not.toMatch(/--color-score:\s*var\(--color-(?:home|away)-accent\)/);
  });

  test("resolves every custom property used by primitive CSS or supplies a fallback", () => {
    const defined = new Set(Array.from(`${tokens}\n${primitives}`.matchAll(/(--[a-z0-9-]+)\s*:/g), (match) => match[1]));
    const references = Array.from(primitives.matchAll(/var\((--[a-z0-9-]+)(\s*,[^)]*)?\)/g));

    for (const [, property, fallback] of references) {
      expect(defined.has(property!) || Boolean(fallback), `Unresolved ${property}`).toBe(true);
    }
  });

  test("contains no recursive direct custom-property references", () => {
    for (const match of tokens.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
      expect(match[2], `${match[1]} must not reference itself`).not.toContain(`var(${match[1]})`);
    }
  });
});
