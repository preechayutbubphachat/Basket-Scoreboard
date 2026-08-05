import type {
  DisplaySceneType,
  PublicFinalSummary,
  PublicFinalSummaryProjection,
  PublicDisplayScreenResponse,
  PublicScheduleDisplayRow
} from "@basket-scoreboard/api-contracts";

type PublicDisplaySceneData = PublicDisplayScreenResponse["data"];

export type PublicDisplaySceneModel =
  | {
      status: "READY";
      sceneType: "BLANK";
      screenSlug: string;
      displayName: string;
      title: string;
      message: string;
      refreshAfterMs: number;
    }
  | {
      status: "READY";
      sceneType: "LIVE_SCOREBOARD";
      screenSlug: string;
      displayName: string;
      matchId: string;
      refreshAfterMs: number;
    }
  | {
      status: "READY";
      sceneType: "SCHEDULE";
      screenSlug: string;
      displayName: string;
      title: string;
      tournamentLabel: string;
      rows: PublicScheduleDisplayRow[];
      emptyMessage: string | null;
      refreshAfterMs: number;
    }
  | {
      status: "READY";
      sceneType: "FINAL_SUMMARY";
      screenSlug: string;
      displayName: string;
      title: string;
      summary: PublicFinalSummaryProjection;
      refreshAfterMs: number;
    }
  | {
      status: "NOT_FOUND" | "ERROR";
      sceneType: DisplaySceneType | "BLANK";
      screenSlug: string | null;
      displayName: string;
      title: string;
      message: string;
      refreshAfterMs: number;
    };

export function getPublicDisplaySceneRefreshMs(value: unknown) {
  const parsed = typeof value === "number" && Number.isFinite(value) ? value : 30000;
  return Math.max(1000, Math.min(120000, parsed));
}

export function buildPublicDisplaySceneModel(
  data: PublicDisplaySceneData | null,
  options: { unavailableState?: "NOT_FOUND" | "ERROR" } = {}
): PublicDisplaySceneModel {
  if (!data) {
    const status = options.unavailableState === "NOT_FOUND" ? "NOT_FOUND" : "ERROR";
    return {
      status,
      sceneType: "BLANK",
      screenSlug: null,
      displayName: "Public Display",
      title: "Display Unavailable",
      message: status === "NOT_FOUND"
        ? "This public display is not available."
        : "The display scene could not be loaded.",
      refreshAfterMs: 30000
    };
  }

  const sceneType = data.activeScene.sceneType;
  const refreshAfterMs = getPublicDisplaySceneRefreshMs(data.activeScene.refreshAfterMs);
  const base = {
    screenSlug: data.screen.screenSlug,
    displayName: cleanText(data.screen.displayName, "Public Display"),
    refreshAfterMs
  };

  if (sceneType === "BLANK") {
    const publicData = asRecord(data.activeScene.publicData);
    return {
      status: "READY",
      sceneType,
      ...base,
      title: "Standby",
      message: cleanText(publicData.message, "Standby")
    };
  }

  if (sceneType === "LIVE_SCOREBOARD") {
    const matchId = getRecordString(asRecord(data.activeScene.publicData), "matchId");
    if (!matchId) {
      return unavailableScene(base, sceneType, "Live scoreboard scene is missing a match.", refreshAfterMs);
    }
    return {
      status: "READY",
      sceneType,
      ...base,
      matchId
    };
  }

  if (sceneType === "SCHEDULE") {
    const publicData = asRecord(data.activeScene.publicData);
    const rows = parsePublicScheduleRows(publicData.rows);
    return {
      status: "READY",
      sceneType,
      ...base,
      title: "Schedule",
      tournamentLabel: cleanText(publicData.tournamentLabel, "Schedule"),
      rows,
      emptyMessage: rows.length === 0
        ? cleanText(publicData.emptyMessage, "No public schedule entries available.")
        : null
    };
  }

  if (sceneType === "FINAL_SUMMARY") {
    const publicData = asRecord(data.activeScene.publicData);
    const matchId = getRecordString(publicData, "matchId");
    if (!matchId) {
      return unavailableScene(base, sceneType, "Final summary scene is missing a match.", refreshAfterMs);
    }
    return {
      status: "READY",
      sceneType,
      ...base,
      title: "Final Summary",
      summary: parsePublicFinalSummary(publicData, matchId)
    };
  }

  return unavailableScene(base, sceneType, "Display scene type is not supported.", refreshAfterMs);
}

export function publicDisplaySceneHasPrivateExposure(value: unknown) {
  const serialized = JSON.stringify(value);
  return /assigned_by_user_id|created_by_user_id|updated_by_user_id|assignedBy|createdBy|updatedBy|reason|actor|device|session|token|csrf|password|authorization|commandId|correlationId|causationId|audit|correctionDetails|emergencyReason|\/operator|\/admin|audit-log|replay|corrections/i.test(serialized);
}

function unavailableScene(
  base: { screenSlug: string; displayName: string },
  sceneType: DisplaySceneType,
  message: string,
  refreshAfterMs: number
): PublicDisplaySceneModel {
  return {
    status: "ERROR",
    sceneType,
    screenSlug: base.screenSlug,
    displayName: base.displayName,
    title: "Display Unavailable",
    message,
    refreshAfterMs
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function getRecordString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function cleanText(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export function formatPublicScheduleDisplayTime(value: string | null) {
  if (!value) {
    return "Time TBD";
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Time TBD"
    : new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit"
      }).format(date);
}

export function formatPublicScheduleDisplayLocation(venueLabel: string | null, courtLabel: string | null) {
  const venue = optionalText(venueLabel);
  const court = optionalText(courtLabel);
  return venue && court ? `${venue} / ${court}` : venue ?? court ?? "Venue TBD";
}

function parsePublicScheduleRows(value: unknown): PublicScheduleDisplayRow[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((candidate): PublicScheduleDisplayRow[] => {
    const row = asRecord(candidate);
    const matchId = getRecordString(row, "matchId");
    const homeTeamName = getRecordString(row, "homeTeamName");
    const awayTeamName = getRecordString(row, "awayTeamName");
    const status = getRecordString(row, "status");
    if (!matchId || !homeTeamName || !awayTeamName || !status || !isPublicScheduleStatus(status)) {
      return [];
    }

    return [{
      matchId,
      scheduledAt: optionalText(row.scheduledAt),
      homeTeamName,
      awayTeamName,
      status,
      courtLabel: optionalText(row.courtLabel),
      venueLabel: optionalText(row.venueLabel),
      tournamentLabel: cleanText(row.tournamentLabel, "Schedule"),
      stageLabel: optionalText(row.stageLabel),
      roundLabel: optionalText(row.roundLabel)
    }];
  });
}

function isPublicScheduleStatus(value: string): value is PublicScheduleDisplayRow["status"] {
  return value === "SCHEDULED" || value === "LIVE" || value === "FINAL";
}

function parsePublicFinalSummary(
  value: Record<string, unknown>,
  matchId: string
): PublicFinalSummaryProjection {
  if (value.status === "UNAVAILABLE") {
    return {
      matchId,
      status: "UNAVAILABLE",
      message: cleanText(value.message, "Final summary is not available.")
    };
  }

  const homeTeamName = getRecordString(value, "homeTeamName");
  const awayTeamName = getRecordString(value, "awayTeamName");
  const homeScore = getRecordScore(value, "homeScore");
  const awayScore = getRecordScore(value, "awayScore");
  const winnerSide = value.winnerSide === "HOME" || value.winnerSide === "AWAY" ? value.winnerSide : null;
  const winnerDisplayName = optionalText(value.winnerDisplayName);
  if (
    value.status !== "FINAL" ||
    !homeTeamName ||
    !awayTeamName ||
    homeScore === null ||
    awayScore === null ||
    (winnerSide === null && winnerDisplayName !== null) ||
    (winnerSide === "HOME" && winnerDisplayName !== homeTeamName) ||
    (winnerSide === "AWAY" && winnerDisplayName !== awayTeamName)
  ) {
    return { matchId, status: "UNAVAILABLE", message: "Final summary is not available." };
  }

  return {
    matchId,
    status: "FINAL",
    homeTeamName,
    awayTeamName,
    homeScore,
    awayScore,
    winnerSide,
    winnerDisplayName,
    tournamentLabel: optionalText(value.tournamentLabel),
    roundLabel: optionalText(value.roundLabel),
    venueLabel: optionalText(value.venueLabel),
    courtLabel: optionalText(value.courtLabel),
    completedAt: validIsoOrNull(value.completedAt)
  } satisfies PublicFinalSummary;
}

function getRecordScore(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function validIsoOrNull(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? null : timestamp.toISOString();
}

function optionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
