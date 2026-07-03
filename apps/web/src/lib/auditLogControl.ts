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
