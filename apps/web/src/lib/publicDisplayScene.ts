import type { DisplaySceneType, PublicDisplayScreenResponse } from "@basket-scoreboard/api-contracts";

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
      tournamentId: string;
      courtId: string | null;
      limit: number;
      refreshAfterMs: number;
    }
  | {
      status: "READY";
      sceneType: "FINAL_SUMMARY";
      screenSlug: string;
      displayName: string;
      title: string;
      matchId: string;
      message: string;
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
    const tournamentId = getRecordString(publicData, "tournamentId");
    if (!tournamentId) {
      return unavailableScene(base, sceneType, "Schedule scene is missing a tournament.", refreshAfterMs);
    }
    return {
      status: "READY",
      sceneType,
      ...base,
      title: "Schedule",
      tournamentId,
      courtId: getRecordString(publicData, "courtId"),
      limit: getSafeLimit(publicData.limit)
    };
  }

  if (sceneType === "FINAL_SUMMARY") {
    const matchId = getRecordString(asRecord(data.activeScene.publicData), "matchId");
    if (!matchId) {
      return unavailableScene(base, sceneType, "Final summary scene is missing a match.", refreshAfterMs);
    }
    return {
      status: "READY",
      sceneType,
      ...base,
      title: "Final Summary",
      matchId,
      message: "Public final summary rendering is not available yet."
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

function getSafeLimit(value: unknown) {
  const parsed = typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : 8;
  return Math.max(1, Math.min(20, parsed));
}
