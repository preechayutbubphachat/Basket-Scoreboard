import type { AuditLogGroupFilter, AuditLogRow, MatchAuditLogResponse } from "@basket-scoreboard/api-contracts";

export function buildAuditLogFilterOptions(): Array<{ value: AuditLogGroupFilter; label: string }> {
  return [
    { value: "all", label: "All" },
    { value: "score", label: "Score" },
    { value: "foul", label: "Fouls" },
    { value: "clock", label: "Clock" },
    { value: "shot_clock", label: "Shot Clock" },
    { value: "timeout", label: "Timeouts" },
    { value: "lifecycle", label: "Lifecycle" },
    { value: "roster_lineup", label: "Roster/Lineup" },
    { value: "correction", label: "Corrections" },
    { value: "rejected", label: "Rejected" },
    { value: "other", label: "Other" }
  ];
}

export function buildAuditLogRowMeta(row: AuditLogRow) {
  return {
    badge: row.group,
    title: row.title,
    actorLabel: row.actor.displayName ?? row.actor.userId ?? "Unavailable",
    reasonLabel: row.reason ?? "Unavailable",
    timestamp: formatTimestamp(row.createdAt)
  };
}

export function buildAuditRowClassName(row: AuditLogRow) {
  return row.group === "CORRECTION" ? "correction-row" : "";
}

export function buildAuditCorrectionDetailRows(row: AuditLogRow) {
  const details = row.correctionDetails ?? null;

  return [
    { label: "Correction event seq", value: row.seq?.toString() ?? "Not recorded" },
    { label: "Corrected event seq", value: details?.correctedEventSeq?.toString() ?? "Not recorded" },
    { label: "Corrected event type", value: details?.correctedEventType ?? "Unknown" },
    { label: "Correction kind", value: details?.correctionKind ?? "Unknown" },
    { label: "Reason", value: details?.reason ?? row.reason ?? "Not recorded" },
    { label: "Old value", value: formatCorrectionValue(details?.oldValue) },
    { label: "New value", value: formatCorrectionValue(details?.newValue) },
    { label: "Delta", value: formatCorrectionValue(details?.delta, true) }
  ];
}

export function getAuditCorrectionRows(auditLog: Pick<MatchAuditLogResponse, "rows">) {
  return auditLog.rows.filter((row) => row.group === "CORRECTION");
}

export function hasAuditLogMutationControls() {
  return false;
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formatCorrectionValue(value: Record<string, unknown> | null | undefined, includeUnit = false) {
  if (!value) {
    return "Not recorded";
  }

  const teamSide = stringOrNull(value.teamSide);
  const points = numberOrNull(value.points);
  if (teamSide && points !== null) {
    return `${teamSide} ${points >= 0 ? "+" : ""}${points}${includeUnit ? " points" : ""}`;
  }

  const fouls = numberOrNull(value.fouls);
  if (teamSide && fouls !== null) {
    return `${teamSide} ${fouls >= 0 ? "+" : ""}${fouls} fouls`;
  }

  const remainingMs = numberOrNull(value.remainingMs);
  if (remainingMs !== null) {
    return `${Math.round(remainingMs / 1000)}s remaining`;
  }

  return JSON.stringify(value);
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberOrNull(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
