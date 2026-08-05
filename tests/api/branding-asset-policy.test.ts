import { describe, expect, it } from "vitest";
import {
  normalizeBrandAssetReference,
  teamDisplayProfileSchema,
  tournamentDisplayThemeSchema
} from "@basket-scoreboard/api-contracts";

describe("first-party branding asset policy", () => {
  it.each([
    "/assets/branding/teams/team-a.png",
    "/assets/branding/teams/team-a.webp",
    "/assets/branding/tournaments/cup.svg",
    "  /assets/branding/teams/team-a.JPEG  "
  ])("accepts and normalizes %s", (value) => {
    expect(normalizeBrandAssetReference(value)).toBe(value.trim());
  });

  it.each([
    "https://example.com/logo.png",
    "http://example.com/logo.png",
    "//example.com/logo.png",
    "data:image/svg+xml,<svg/>",
    "javascript:alert(1)",
    "blob:https://example.com/id",
    "file:///tmp/logo.png",
    "https://user:pass@example.com/logo.png",
    "C:\\images\\logo.png",
    "/assets/branding/teams/team.png\u0000",
    "/assets/branding/teams/<team>.png",
    "/assets/branding/../secret.png",
    "/assets/branding/%2e%2e/secret.png",
    "/assets/branding/%252e%252e/secret.png",
    "/assets/team.png",
    "/assets/branding/team.png?version=1",
    "/assets/branding/team.png#mark",
    "/assets/branding/team.svg.js",
    "/assets/branding/team.png.exe",
    "/assets/branding/team.png.",
    "/assets/branding/team.%70%6e%67.js"
  ])("rejects %s", (value) => {
    expect(normalizeBrandAssetReference(value)).toBeNull();
  });

  it("preserves explicit empty and removal semantics", () => {
    expect(normalizeBrandAssetReference("  ")).toBeNull();
    expect(tournamentDisplayThemeSchema.parse({ logoUrl: "  " }).logoUrl).toBeNull();
    expect(teamDisplayProfileSchema.parse({ logoUrl: null }).logoUrl).toBeNull();
  });

  it("normalizes valid admin contract input and rejects unsafe input", () => {
    expect(tournamentDisplayThemeSchema.parse({
      logoUrl: " /assets/branding/tournaments/cup.svg "
    }).logoUrl).toBe("/assets/branding/tournaments/cup.svg");
    expect(() => teamDisplayProfileSchema.parse({
      logoUrl: "https://cdn.example.com/team.png"
    })).toThrow(/first-party branding asset path/);
  });
});
