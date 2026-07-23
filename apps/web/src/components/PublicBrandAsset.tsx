import { useState } from "react";
import { normalizeBrandAssetReference } from "@basket-scoreboard/api-contracts";

export function getPublicBrandAssetState(
  src: string | null | undefined,
  failedSrc: string | null,
  loadedSrc: string | null = null
) {
  const normalizedSrc = normalizeBrandAssetReference(src);
  return {
    normalizedSrc,
    renderImage: Boolean(normalizedSrc && normalizedSrc !== failedSrc),
    showImage: Boolean(normalizedSrc && normalizedSrc === loadedSrc && normalizedSrc !== failedSrc),
    showFallback: !normalizedSrc || normalizedSrc !== loadedSrc || normalizedSrc === failedSrc
  };
}

export function PublicBrandAsset({
  src,
  alt,
  fallbackLabel,
  className
}: {
  src: string | null | undefined;
  alt: string;
  fallbackLabel: string;
  className: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const state = getPublicBrandAssetState(src, failedSrc, loadedSrc);

  return (
    <span className={`${className} public-brand-asset`}>
      {state.renderImage ? (
        <img
          className={state.showImage ? "is-loaded" : "is-loading"}
          src={state.normalizedSrc ?? undefined}
          alt={state.showImage ? alt : ""}
          aria-hidden={!state.showImage}
          onLoad={() => setLoadedSrc(state.normalizedSrc)}
          onError={() => setFailedSrc(state.normalizedSrc)}
        />
      ) : null}
      {state.showFallback ? (
        <span className="public-brand-asset-fallback" aria-label={alt}>{fallbackLabel}</span>
      ) : null}
    </span>
  );
}
