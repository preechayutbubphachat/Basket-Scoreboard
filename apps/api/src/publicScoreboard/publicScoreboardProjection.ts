import type {
  PublicScoreboardProjection,
  ScoreboardProjection
} from "@basket-scoreboard/api-contracts";

const forbiddenSequenceKeys = new Set([
  "seq",
  "sequence",
  "seqno",
  "eventseq",
  "eventsequence",
  "raweventseq",
  "raweventsequence",
  "projectionseq",
  "projectionsequence",
  "currentsequence",
  "lasteventseq",
  "expectedseq",
  "currentseq"
]);

export function toPublicScoreboardProjection(
  projection: ScoreboardProjection
): PublicScoreboardProjection {
  return stripSequenceFields(projection) as PublicScoreboardProjection;
}

function stripSequenceFields(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripSequenceFields);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !forbiddenSequenceKeys.has(normalizeKey(key)))
      .map(([key, nestedValue]) => [key, stripSequenceFields(nestedValue)])
  );
}

function normalizeKey(key: string) {
  return key.replace(/[^a-z0-9]/gi, "").toLowerCase();
}
