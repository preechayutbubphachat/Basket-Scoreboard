import { randomUUID } from "node:crypto";
import type { Pool } from "mysql2/promise";
import {
  parseDisplaySceneConfig,
  reasonCodes,
  type ActiveDisplaySceneInput,
  type ActiveDisplaySceneResponse,
  type CreateDisplaySceneInput,
  type CreateDisplayScreenInput,
  type DisplaySceneConfig,
  type DisplaySceneResponse,
  type DisplaySceneType,
  type DisplayScreenResponse,
  type PublicDisplayScreenResponse,
  type ReasonCode,
  type UpdateDisplaySceneInput,
  type UpdateDisplayScreenInput
} from "@basket-scoreboard/api-contracts";
import {
  displayTournamentExists,
  findDisplayScene,
  findDisplayScreen,
  findPublicDisplayBySlug,
  insertDisplayScene,
  insertDisplayScreen,
  listDisplayScenes,
  listDisplayScreens,
  updateDisplayScene,
  updateDisplayScreen,
  upsertActiveDisplayScene
} from "./displayScreenRepository.js";
import { resolvePublicScheduleDisplayProjection } from "../tournaments/publicScheduleDisplayProjection.js";

type ServiceResult<T> =
  | { ok: true; value: T }
  | { ok: false; statusCode: number; reasonCode: ReasonCode; message: string };

export async function listScreens(pool: Pool): Promise<DisplayScreenResponse[]> {
  return listDisplayScreens(pool);
}

export async function createScreen(
  pool: Pool,
  input: CreateDisplayScreenInput,
  userId: string
): Promise<ServiceResult<DisplayScreenResponse>> {
  const ownerCheck = await checkTournamentOwner(pool, input.tournamentId ?? null);
  if (!ownerCheck.ok) {
    return ownerCheck;
  }

  const screen = await insertDisplayScreen(pool, {
    screenId: input.screenId ?? randomUUID(),
    screenSlug: input.screenSlug,
    displayName: input.displayName,
    tournamentId: input.tournamentId ?? null,
    description: input.description ?? null,
    publicEnabled: input.publicEnabled,
    active: input.active,
    userId
  });

  return { ok: true, value: screen };
}

export async function getScreen(pool: Pool, screenId: string): Promise<ServiceResult<DisplayScreenResponse>> {
  const screen = await findDisplayScreen(pool, screenId);
  return screen
    ? { ok: true, value: screen }
    : { ok: false, statusCode: 404, reasonCode: reasonCodes.MATCH_NOT_FOUND, message: "Display screen was not found" };
}

export async function updateScreen(
  pool: Pool,
  screenId: string,
  input: UpdateDisplayScreenInput,
  userId: string
): Promise<ServiceResult<DisplayScreenResponse>> {
  const ownerCheck = await checkTournamentOwner(pool, input.tournamentId ?? null);
  if (!ownerCheck.ok) {
    return ownerCheck;
  }

  const updateInput = {
    userId,
    ...(input.screenSlug !== undefined ? { screenSlug: input.screenSlug } : {}),
    ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
    ...(input.tournamentId !== undefined ? { tournamentId: input.tournamentId ?? null } : {}),
    ...(input.description !== undefined ? { description: input.description ?? null } : {}),
    ...(input.publicEnabled !== undefined ? { publicEnabled: input.publicEnabled } : {}),
    ...(input.active !== undefined ? { active: input.active } : {})
  };
  const screen = await updateDisplayScreen(pool, screenId, updateInput);
  return screen
    ? { ok: true, value: screen }
    : { ok: false, statusCode: 404, reasonCode: reasonCodes.MATCH_NOT_FOUND, message: "Display screen was not found" };
}

export async function listScenes(pool: Pool, screenId: string): Promise<ServiceResult<DisplaySceneResponse[]>> {
  const screen = await findDisplayScreen(pool, screenId);
  if (!screen) {
    return { ok: false, statusCode: 404, reasonCode: reasonCodes.MATCH_NOT_FOUND, message: "Display screen was not found" };
  }

  return { ok: true, value: await listDisplayScenes(pool, screenId) };
}

export async function createScene(
  pool: Pool,
  screenId: string,
  input: CreateDisplaySceneInput,
  userId: string
): Promise<ServiceResult<DisplaySceneResponse>> {
  const screen = await findDisplayScreen(pool, screenId);
  if (!screen) {
    return { ok: false, statusCode: 404, reasonCode: reasonCodes.MATCH_NOT_FOUND, message: "Display screen was not found" };
  }

  const sceneConfig = parseDisplaySceneConfig(input.sceneType, input.sceneConfig);
  const scene = await insertDisplayScene(pool, {
    sceneId: input.sceneId ?? randomUUID(),
    screenId,
    sceneType: input.sceneType,
    sceneName: input.sceneName,
    sceneConfig,
    sortOrder: input.sortOrder,
    active: input.active,
    userId
  });

  return { ok: true, value: scene };
}

export async function updateScene(
  pool: Pool,
  screenId: string,
  sceneId: string,
  input: UpdateDisplaySceneInput,
  userId: string
): Promise<ServiceResult<DisplaySceneResponse>> {
  const existing = await findDisplayScene(pool, screenId, sceneId);
  if (!existing) {
    return { ok: false, statusCode: 404, reasonCode: reasonCodes.MATCH_NOT_FOUND, message: "Display scene was not found" };
  }

  const sceneType = input.sceneType ?? existing.sceneType;
  const sceneConfig = input.sceneConfig === undefined
    ? undefined
    : parseDisplaySceneConfig(sceneType, input.sceneConfig);
  const updateInput = {
    userId,
    sceneType,
    ...(input.sceneName !== undefined ? { sceneName: input.sceneName } : {}),
    ...(sceneConfig !== undefined ? { sceneConfig } : {}),
    ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
    ...(input.active !== undefined ? { active: input.active } : {})
  };
  const scene = await updateDisplayScene(pool, screenId, sceneId, updateInput);

  return scene
    ? { ok: true, value: scene }
    : { ok: false, statusCode: 404, reasonCode: reasonCodes.MATCH_NOT_FOUND, message: "Display scene was not found" };
}

export async function assignActiveScene(
  pool: Pool,
  screenId: string,
  input: ActiveDisplaySceneInput,
  userId: string
): Promise<ServiceResult<ActiveDisplaySceneResponse>> {
  const screen = await findDisplayScreen(pool, screenId);
  if (!screen) {
    return { ok: false, statusCode: 404, reasonCode: reasonCodes.MATCH_NOT_FOUND, message: "Display screen was not found" };
  }

  const scene = await findDisplayScene(pool, screenId, input.sceneId);
  if (!scene) {
    return {
      ok: false,
      statusCode: 422,
      reasonCode: reasonCodes.VALIDATION_ERROR,
      message: "Active scene must belong to the target display screen"
    };
  }

  const active = await upsertActiveDisplayScene(pool, screenId, scene.sceneId, userId);
  return active
    ? { ok: true, value: active }
    : { ok: false, statusCode: 404, reasonCode: reasonCodes.MATCH_NOT_FOUND, message: "Display active scene was not found" };
}

export async function getPublicDisplay(
  pool: Pool,
  screenSlug: string
): Promise<ServiceResult<PublicDisplayScreenResponse["data"]>> {
  const display = await findPublicDisplayBySlug(pool, screenSlug);
  if (!display) {
    return { ok: false, statusCode: 404, reasonCode: reasonCodes.MATCH_NOT_FOUND, message: "Public display screen was not found" };
  }

  const scene = display.scene;
  const activeScene = scene
    ? await toPublicScene(pool, scene.sceneType, scene.sceneConfig)
    : await toPublicScene(pool, "BLANK", { message: "Standby" });

  return {
    ok: true,
    value: {
      screen: {
        screenSlug: display.screen.screenSlug,
        displayName: display.screen.displayName
      },
      activeScene,
      serverTime: new Date().toISOString()
    }
  };
}

async function checkTournamentOwner(pool: Pool, tournamentId: string | null): Promise<ServiceResult<null>> {
  if (!tournamentId) {
    return { ok: true, value: null };
  }

  return await displayTournamentExists(pool, tournamentId)
    ? { ok: true, value: null }
    : { ok: false, statusCode: 404, reasonCode: reasonCodes.MATCH_NOT_FOUND, message: "Tournament was not found" };
}

async function toPublicScene(pool: Pool, sceneType: DisplaySceneType, sceneConfig: DisplaySceneConfig) {
  try {
    const parsed = parseDisplaySceneConfig(sceneType, sceneConfig);
    if (sceneType === "SCHEDULE" && "tournamentId" in parsed) {
      const projection = await resolvePublicScheduleDisplayProjection(pool, parsed.tournamentId, {
        courtId: parsed.courtId ?? null,
        limit: parsed.limit ?? 8
      });
      return {
        sceneType,
        publicData: projection ?? {
          tournamentLabel: "Schedule",
          rows: [],
          emptyMessage: "No public schedule entries available."
        },
        refreshAfterMs: refreshAfterMsForScene(sceneType)
      };
    }

    return {
      sceneType,
      publicData: publicDataForScene(sceneType, parsed),
      refreshAfterMs: refreshAfterMsForScene(sceneType)
    };
  } catch {
    return {
      sceneType: "BLANK" as const,
      publicData: { message: "Standby" },
      refreshAfterMs: 30000
    };
  }
}

function publicDataForScene(sceneType: DisplaySceneType, sceneConfig: DisplaySceneConfig) {
  if (sceneType === "LIVE_SCOREBOARD" && "matchId" in sceneConfig) {
    return { matchId: sceneConfig.matchId };
  }

  if (sceneType === "FINAL_SUMMARY" && "matchId" in sceneConfig) {
    return {
      matchId: sceneConfig.matchId,
      status: "UNAVAILABLE"
    };
  }

  if (sceneType === "BLANK") {
    return {
      message: "message" in sceneConfig ? sceneConfig.message ?? "Standby" : "Standby"
    };
  }

  return { message: "Standby" };
}

function refreshAfterMsForScene(sceneType: DisplaySceneType) {
  if (sceneType === "LIVE_SCOREBOARD") {
    return 2000;
  }

  if (sceneType === "SCHEDULE") {
    return 15000;
  }

  if (sceneType === "FINAL_SUMMARY") {
    return 30000;
  }

  return 30000;
}
