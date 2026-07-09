import type {
  ActiveDisplaySceneResponse,
  CreateDisplaySceneInput,
  CreateDisplayScreenInput,
  DisplaySceneResponse,
  DisplaySceneType,
  DisplayScreenResponse,
  PublicDisplayScreenResponse,
  UpdateDisplaySceneInput,
  UpdateDisplayScreenInput
} from "@basket-scoreboard/api-contracts";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const screenSlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const displaySceneTypeOptions: Array<{ value: DisplaySceneType; label: string; description: string }> = [
  {
    value: "LIVE_SCOREBOARD",
    label: "Live Scoreboard",
    description: "Reuse the current public match display for one match."
  },
  {
    value: "SCHEDULE",
    label: "Schedule",
    description: "Show public tournament schedule data for a screen."
  },
  {
    value: "FINAL_SUMMARY",
    label: "Final Summary",
    description: "Planned final summary scene with safe placeholder public data."
  },
  {
    value: "BLANK",
    label: "Blank",
    description: "Standby display with an optional short message."
  }
];

export type DisplayScreenFormState = {
  screenSlug: string;
  displayName: string;
  tournamentId: string;
  description: string;
  publicEnabled: boolean;
  active: boolean;
};

export type DisplaySceneFormState = {
  sceneType: DisplaySceneType;
  sceneName: string;
  matchId: string;
  tournamentId: string;
  courtId: string;
  limit: string;
  message: string;
  sortOrder: string;
  active: boolean;
};

export function buildAdminDisplayScreensLink() {
  return "/admin/display-screens";
}

export function buildAdminDisplayScreenNewLink() {
  return "/admin/display-screens/new";
}

export function buildAdminDisplayScreenDetailLink(screenId: string) {
  return `/admin/display-screens/${encodeURIComponent(screenId)}`;
}

export function buildAdminDisplayScreenScenesLink(screenId: string) {
  return `/admin/display-screens/${encodeURIComponent(screenId)}/scenes`;
}

export function buildAdminDisplayScreenPreviewLink(screenId: string) {
  return `/admin/display-screens/${encodeURIComponent(screenId)}/preview`;
}

export function buildPublicDisplayScreenLink(screenSlug: string) {
  return `/public/display/${encodeURIComponent(screenSlug)}`;
}

export function createDisplayScreenFormState(screen?: DisplayScreenResponse | null): DisplayScreenFormState {
  return {
    screenSlug: screen?.screenSlug ?? "",
    displayName: screen?.displayName ?? "",
    tournamentId: screen?.tournamentId ?? "",
    description: screen?.description ?? "",
    publicEnabled: screen?.publicEnabled ?? true,
    active: screen?.active ?? true
  };
}

export function createDisplayScreenPayload(form: DisplayScreenFormState): CreateDisplayScreenInput {
  return {
    screenSlug: form.screenSlug.trim(),
    displayName: form.displayName.trim(),
    tournamentId: normalizeOptionalString(form.tournamentId),
    description: normalizeOptionalString(form.description),
    publicEnabled: form.publicEnabled,
    active: form.active
  };
}

export function createDisplayScreenUpdatePayload(form: DisplayScreenFormState): UpdateDisplayScreenInput {
  return createDisplayScreenPayload(form);
}

export function validateDisplayScreenForm(form: DisplayScreenFormState) {
  const screenSlug = form.screenSlug.trim();
  const displayName = form.displayName.trim();
  const tournamentId = form.tournamentId.trim();
  const description = form.description.trim();

  if (!screenSlug) return "Screen slug is required.";
  if (!screenSlugPattern.test(screenSlug)) {
    return "Screen slug must use lowercase letters, numbers, and single hyphens.";
  }
  if (!displayName) return "Display name is required.";
  if (displayName.length > 120) return "Display name must be 120 characters or fewer.";
  if (tournamentId && !uuidPattern.test(tournamentId)) return "Tournament ID must be a valid UUID.";
  if (description.length > 255) return "Description must be 255 characters or fewer.";
  return null;
}

export function getDisplayScreenSaveState(input: {
  saving: boolean;
  routeId?: string | null;
  validationMessage?: string | null;
}) {
  if (input.saving) return { disabled: true, reason: "Saving display screen..." };
  if (input.routeId === "") return { disabled: true, reason: "Missing display screen id." };
  if (input.validationMessage) return { disabled: true, reason: input.validationMessage };
  return { disabled: false, reason: null };
}

export function createDisplaySceneFormState(scene?: DisplaySceneResponse | null): DisplaySceneFormState {
  const sceneType = scene?.sceneType ?? "BLANK";
  const config = scene?.sceneConfig ?? {};
  return {
    sceneType,
    sceneName: scene?.sceneName ?? defaultSceneName(sceneType),
    matchId: "matchId" in config && typeof config.matchId === "string" ? config.matchId : "",
    tournamentId: "tournamentId" in config && typeof config.tournamentId === "string" ? config.tournamentId : "",
    courtId: "courtId" in config && typeof config.courtId === "string" ? config.courtId : "",
    limit: "limit" in config && typeof config.limit === "number" ? String(config.limit) : "8",
    message: "message" in config && typeof config.message === "string" ? config.message : "",
    sortOrder: scene ? String(scene.sortOrder) : "0",
    active: scene?.active ?? true
  };
}

export function createDisplayScenePayload(form: DisplaySceneFormState): CreateDisplaySceneInput {
  return {
    sceneType: form.sceneType,
    sceneName: form.sceneName.trim(),
    sceneConfig: buildSceneConfig(form),
    sortOrder: Number.parseInt(form.sortOrder || "0", 10),
    active: form.active
  };
}

export function createDisplaySceneUpdatePayload(form: DisplaySceneFormState): UpdateDisplaySceneInput {
  return createDisplayScenePayload(form);
}

export function validateDisplaySceneForm(form: DisplaySceneFormState) {
  const sceneName = form.sceneName.trim();
  const sortOrder = Number.parseInt(form.sortOrder || "0", 10);
  const limit = Number.parseInt(form.limit || "8", 10);

  if (!sceneName) return "Scene name is required.";
  if (sceneName.length > 120) return "Scene name must be 120 characters or fewer.";
  if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 1000) {
    return "Sort order must be a whole number from 0 to 1000.";
  }
  if (form.sceneType === "LIVE_SCOREBOARD" && !uuidPattern.test(form.matchId.trim())) {
    return "Live Scoreboard scene requires a valid match UUID.";
  }
  if (form.sceneType === "FINAL_SUMMARY" && !uuidPattern.test(form.matchId.trim())) {
    return "Final Summary scene requires a valid match UUID.";
  }
  if (form.sceneType === "SCHEDULE") {
    if (!uuidPattern.test(form.tournamentId.trim())) return "Schedule scene requires a valid tournament UUID.";
    if (form.courtId.trim() && !uuidPattern.test(form.courtId.trim())) return "Court ID must be a valid UUID.";
    if (!Number.isInteger(limit) || limit < 1 || limit > 20) return "Schedule limit must be from 1 to 20.";
  }
  if (form.sceneType === "BLANK" && form.message.trim().length > 120) {
    return "Blank scene message must be 120 characters or fewer.";
  }
  return null;
}

export function getDisplaySceneSaveState(input: {
  saving: boolean;
  screenId?: string | null;
  validationMessage?: string | null;
}) {
  if (input.saving) return { disabled: true, reason: "Saving display scene..." };
  if (!input.screenId) return { disabled: true, reason: "Missing display screen id." };
  if (input.validationMessage) return { disabled: true, reason: input.validationMessage };
  return { disabled: false, reason: null };
}

export function getDisplaySceneConfigSummary(scene: DisplaySceneResponse | ActiveDisplaySceneResponse["scene"]) {
  const config = scene.sceneConfig;
  if (scene.sceneType === "LIVE_SCOREBOARD" && "matchId" in config) {
    return `Match ${config.matchId}`;
  }
  if (scene.sceneType === "SCHEDULE" && "tournamentId" in config) {
    const court = "courtId" in config && config.courtId ? `, court ${config.courtId}` : "";
    return `Tournament ${config.tournamentId}${court}, limit ${"limit" in config ? config.limit ?? 8 : 8}`;
  }
  if (scene.sceneType === "FINAL_SUMMARY" && "matchId" in config) {
    return `Final summary for match ${config.matchId}`;
  }
  if (scene.sceneType === "BLANK" && "message" in config && config.message) {
    return config.message;
  }
  return "Standby";
}

export function getPublicDisplayPreviewSummary(preview: PublicDisplayScreenResponse["data"] | null) {
  if (!preview) return "Public preview unavailable.";
  return `${preview.screen.displayName}: ${preview.activeScene.sceneType}`;
}

export function publicDisplayPreviewHasPrivateExposure(value: unknown) {
  const serialized = JSON.stringify(value);
  return /emergencyReason|emergency_reason|created_by_user_id|updated_by_user_id|createdBy|updatedBy|reason|actor|device|session|token|csrf|password|authorization|commandId|correlationId|causationId|audit|correctionDetails|\/operator|\/admin|audit-log|replay|corrections/i.test(serialized);
}

function buildSceneConfig(form: DisplaySceneFormState): CreateDisplaySceneInput["sceneConfig"] {
  if (form.sceneType === "LIVE_SCOREBOARD") {
    return { matchId: form.matchId.trim() };
  }
  if (form.sceneType === "SCHEDULE") {
    return {
      tournamentId: form.tournamentId.trim(),
      courtId: normalizeOptionalString(form.courtId),
      limit: Number.parseInt(form.limit || "8", 10)
    };
  }
  if (form.sceneType === "FINAL_SUMMARY") {
    return { matchId: form.matchId.trim() };
  }
  return { message: normalizeOptionalString(form.message) };
}

function defaultSceneName(sceneType: DisplaySceneType) {
  return displaySceneTypeOptions.find((option) => option.value === sceneType)?.label ?? "Display Scene";
}

function normalizeOptionalString(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}
