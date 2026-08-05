import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getPublicBrandAssetState, PublicBrandAsset } from "../../apps/web/src/components/PublicBrandAsset";

describe("public brand asset fallback", () => {
  it("renders a valid first-party image in a fixed fallback container", () => {
    const html = renderToStaticMarkup(createElement(PublicBrandAsset, {
      src: "/assets/branding/teams/team-a.png",
      alt: "Bangkok Tigers logo",
      fallbackLabel: "BT",
      className: "public-display-team-logo"
    }));
    expect(html).toContain('src="/assets/branding/teams/team-a.png"');
    expect(html).toContain('src="/assets/branding/teams/team-a.png"');
    expect(html).toContain('aria-label="Bangkok Tigers logo"');
    expect(html).toContain("BT");
    expect(html).not.toContain("https://");
  });

  it("renders a monogram for missing or invalid references", () => {
    for (const src of [null, "https://example.com/team.png", "/assets/team.png"]) {
      const html = renderToStaticMarkup(createElement(PublicBrandAsset, {
        src,
        alt: "Bangkok Tigers logo",
        fallbackLabel: "BT",
        className: "public-display-team-logo"
      }));
      expect(html).toContain("public-brand-asset-fallback");
      expect(html).toContain("BT");
      expect(html).not.toContain("<img");
    }
  });

  it("falls back after an error and resets when the source changes", () => {
    const first = "/assets/branding/teams/team-a.png";
    const next = "/assets/branding/teams/team-b.webp";
    expect(getPublicBrandAssetState(first, first, null)).toMatchObject({ renderImage: false, showImage: false, showFallback: true });
    expect(getPublicBrandAssetState(next, first)).toMatchObject({
      normalizedSrc: next,
      renderImage: true,
      showImage: false,
      showFallback: true
    });
    expect(getPublicBrandAssetState(next, null, next)).toMatchObject({ showImage: true, showFallback: false });
  });
});
