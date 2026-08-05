import type { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import type {
  DisplaySceneConfig,
  DisplaySceneResponse,
  DisplaySceneType,
  DisplayScreenResponse
} from "@basket-scoreboard/api-contracts";

type DisplayScreenRow = RowDataPacket & {
  screen_id: string;
  screen_slug: string;
  display_name: string;
  tournament_id: string | null;
  description: string | null;
  public_enabled: number | boolean;
  active: number | boolean;
};

type DisplaySceneRow = RowDataPacket & {
  scene_id: string;
  screen_id: string;
  scene_type: DisplaySceneType;
  scene_name: string;
  scene_config: string | DisplaySceneConfig;
  sort_order: number;
  active: number | boolean;
};

type ActiveSceneRow = DisplayScreenRow & {
  active_scene_id: string | null;
  scene_type: DisplaySceneType | null;
  scene_name: string | null;
  scene_config: string | DisplaySceneConfig | null;
  sort_order: number | null;
  scene_active: number | boolean | null;
  assigned_at: Date | string | null;
};

export type DisplayScreenInsert = {
  screenId: string;
  screenSlug: string;
  displayName: string;
  tournamentId: string | null;
  description: string | null;
  publicEnabled: boolean;
  active: boolean;
  userId: string;
};

export type DisplayScreenUpdate = Partial<Omit<DisplayScreenInsert, "screenId" | "userId">> & {
  userId: string;
};

export type DisplaySceneInsert = {
  sceneId: string;
  screenId: string;
  sceneType: DisplaySceneType;
  sceneName: string;
  sceneConfig: DisplaySceneConfig;
  sortOrder: number;
  active: boolean;
  userId: string;
};

export type DisplaySceneUpdate = Partial<Omit<DisplaySceneInsert, "sceneId" | "screenId" | "userId">> & {
  userId: string;
};

export async function displayTournamentExists(pool: Pool, tournamentId: string) {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT tournament_id FROM tournaments WHERE tournament_id = ? LIMIT 1",
    [tournamentId]
  );
  return rows.length > 0;
}

export async function listDisplayScreens(pool: Pool) {
  const [rows] = await pool.query<DisplayScreenRow[]>(
    `SELECT screen_id, screen_slug, display_name, tournament_id, description, public_enabled, active
     FROM display_screens
     ORDER BY display_name ASC, screen_slug ASC`
  );
  return rows.map(serializeScreen);
}

export async function findDisplayScreen(pool: Pool, screenId: string) {
  const [rows] = await pool.query<DisplayScreenRow[]>(
    `SELECT screen_id, screen_slug, display_name, tournament_id, description, public_enabled, active
     FROM display_screens
     WHERE screen_id = ?
     LIMIT 1`,
    [screenId]
  );
  return rows[0] ? serializeScreen(rows[0]) : null;
}

export async function insertDisplayScreen(pool: Pool, input: DisplayScreenInsert) {
  await pool.query(
    `INSERT INTO display_screens (
       screen_id,
       screen_slug,
       display_name,
       tournament_id,
       description,
       public_enabled,
       active,
       created_by_user_id,
       updated_by_user_id
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.screenId,
      input.screenSlug,
      input.displayName,
      input.tournamentId,
      input.description,
      input.publicEnabled ? 1 : 0,
      input.active ? 1 : 0,
      input.userId,
      input.userId
    ]
  );

  return (await findDisplayScreen(pool, input.screenId))!;
}

export async function updateDisplayScreen(pool: Pool, screenId: string, input: DisplayScreenUpdate) {
  const assignments: string[] = [];
  const params: unknown[] = [];

  addOptional(assignments, params, "screen_slug", input.screenSlug);
  addOptional(assignments, params, "display_name", input.displayName);
  addOptional(assignments, params, "tournament_id", input.tournamentId);
  addOptional(assignments, params, "description", input.description);
  addOptional(assignments, params, "public_enabled", input.publicEnabled === undefined ? undefined : input.publicEnabled ? 1 : 0);
  addOptional(assignments, params, "active", input.active === undefined ? undefined : input.active ? 1 : 0);

  assignments.push("updated_by_user_id = ?");
  params.push(input.userId, screenId);

  const [result] = await pool.query<ResultSetHeader>(
    `UPDATE display_screens
     SET ${assignments.join(", ")}
     WHERE screen_id = ?`,
    params
  );

  return result.affectedRows > 0 ? await findDisplayScreen(pool, screenId) : null;
}

export async function listDisplayScenes(pool: Pool, screenId: string) {
  const [rows] = await pool.query<DisplaySceneRow[]>(
    `SELECT scene_id, screen_id, scene_type, scene_name, scene_config, sort_order, active
     FROM display_scenes
     WHERE screen_id = ?
     ORDER BY sort_order ASC, scene_name ASC`,
    [screenId]
  );
  return rows.map(serializeScene);
}

export async function findDisplayScene(pool: Pool, screenId: string, sceneId: string) {
  const [rows] = await pool.query<DisplaySceneRow[]>(
    `SELECT scene_id, screen_id, scene_type, scene_name, scene_config, sort_order, active
     FROM display_scenes
     WHERE screen_id = ? AND scene_id = ?
     LIMIT 1`,
    [screenId, sceneId]
  );
  return rows[0] ? serializeScene(rows[0]) : null;
}

export async function insertDisplayScene(pool: Pool, input: DisplaySceneInsert) {
  await pool.query(
    `INSERT INTO display_scenes (
       scene_id,
       screen_id,
       scene_type,
       scene_name,
       scene_config,
       sort_order,
       active,
       created_by_user_id,
       updated_by_user_id
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.sceneId,
      input.screenId,
      input.sceneType,
      input.sceneName,
      JSON.stringify(input.sceneConfig),
      input.sortOrder,
      input.active ? 1 : 0,
      input.userId,
      input.userId
    ]
  );

  return (await findDisplayScene(pool, input.screenId, input.sceneId))!;
}

export async function updateDisplayScene(pool: Pool, screenId: string, sceneId: string, input: DisplaySceneUpdate) {
  const assignments: string[] = [];
  const params: unknown[] = [];

  addOptional(assignments, params, "scene_type", input.sceneType);
  addOptional(assignments, params, "scene_name", input.sceneName);
  addOptional(assignments, params, "scene_config", input.sceneConfig === undefined ? undefined : JSON.stringify(input.sceneConfig));
  addOptional(assignments, params, "sort_order", input.sortOrder);
  addOptional(assignments, params, "active", input.active === undefined ? undefined : input.active ? 1 : 0);

  assignments.push("updated_by_user_id = ?");
  params.push(input.userId, screenId, sceneId);

  const [result] = await pool.query<ResultSetHeader>(
    `UPDATE display_scenes
     SET ${assignments.join(", ")}
     WHERE screen_id = ? AND scene_id = ?`,
    params
  );

  return result.affectedRows > 0 ? await findDisplayScene(pool, screenId, sceneId) : null;
}

export async function upsertActiveDisplayScene(pool: Pool, screenId: string, sceneId: string, userId: string) {
  await pool.query(
    `INSERT INTO display_screen_active_scenes (screen_id, scene_id, assigned_by_user_id)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE
       scene_id = VALUES(scene_id),
       assigned_by_user_id = VALUES(assigned_by_user_id),
       assigned_at = CURRENT_TIMESTAMP,
       updated_at = CURRENT_TIMESTAMP`,
    [screenId, sceneId, userId]
  );

  const active = await findPublicDisplayScreenById(pool, screenId);
  return active?.scene ? {
    screenId,
    scene: active.scene,
    assignedAt: active.assignedAt ?? new Date().toISOString()
  } : null;
}

export async function findPublicDisplayBySlug(pool: Pool, screenSlug: string) {
  const [rows] = await pool.query<ActiveSceneRow[]>(
    `SELECT
       ds.screen_id,
       ds.screen_slug,
       ds.display_name,
       ds.tournament_id,
       ds.description,
       ds.public_enabled,
       ds.active,
       sc.scene_id AS active_scene_id,
       sc.scene_type,
       sc.scene_name,
       sc.scene_config,
       sc.sort_order,
       sc.active AS scene_active,
       das.assigned_at
     FROM display_screens ds
     LEFT JOIN display_screen_active_scenes das ON das.screen_id = ds.screen_id
     LEFT JOIN display_scenes sc ON sc.screen_id = ds.screen_id AND sc.scene_id = das.scene_id AND sc.active = 1
     WHERE ds.screen_slug = ? AND ds.public_enabled = 1 AND ds.active = 1
     LIMIT 1`,
    [screenSlug]
  );

  return rows[0] ? serializeActiveScene(rows[0]) : null;
}

async function findPublicDisplayScreenById(pool: Pool, screenId: string) {
  const [rows] = await pool.query<ActiveSceneRow[]>(
    `SELECT
       ds.screen_id,
       ds.screen_slug,
       ds.display_name,
       ds.tournament_id,
       ds.description,
       ds.public_enabled,
       ds.active,
       sc.scene_id AS active_scene_id,
       sc.scene_type,
       sc.scene_name,
       sc.scene_config,
       sc.sort_order,
       sc.active AS scene_active,
       das.assigned_at
     FROM display_screens ds
     LEFT JOIN display_screen_active_scenes das ON das.screen_id = ds.screen_id
     LEFT JOIN display_scenes sc ON sc.screen_id = ds.screen_id AND sc.scene_id = das.scene_id
     WHERE ds.screen_id = ?
     LIMIT 1`,
    [screenId]
  );

  return rows[0] ? serializeActiveScene(rows[0]) : null;
}

function addOptional(assignments: string[], params: unknown[], columnName: string, value: unknown) {
  if (value !== undefined) {
    assignments.push(`${columnName} = ?`);
    params.push(value);
  }
}

function serializeScreen(row: DisplayScreenRow): DisplayScreenResponse {
  return {
    screenId: row.screen_id,
    screenSlug: row.screen_slug,
    displayName: row.display_name,
    tournamentId: row.tournament_id,
    description: row.description,
    publicEnabled: Boolean(row.public_enabled),
    active: Boolean(row.active)
  };
}

function serializeScene(row: DisplaySceneRow): DisplaySceneResponse {
  return {
    sceneId: row.scene_id,
    screenId: row.screen_id,
    sceneType: row.scene_type,
    sceneName: row.scene_name,
    sceneConfig: parseJsonConfig(row.scene_config),
    sortOrder: row.sort_order,
    active: Boolean(row.active)
  };
}

function serializeActiveScene(row: ActiveSceneRow) {
  return {
    screen: serializeScreen(row),
    scene: row.active_scene_id && row.scene_type && row.scene_name
      ? serializeScene({
          scene_id: row.active_scene_id,
          screen_id: row.screen_id,
          scene_type: row.scene_type,
          scene_name: row.scene_name,
          scene_config: row.scene_config ?? {},
          sort_order: row.sort_order ?? 0,
          active: row.scene_active ?? true
        } as DisplaySceneRow)
      : null,
    assignedAt: row.assigned_at ? toIso(row.assigned_at) : null
  };
}

function parseJsonConfig(value: string | DisplaySceneConfig): DisplaySceneConfig {
  return typeof value === "string" ? JSON.parse(value) as DisplaySceneConfig : value;
}

function toIso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
