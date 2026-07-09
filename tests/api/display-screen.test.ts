import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApiApp } from "../../apps/api/src/app";

const adminUserId = "00000000-0000-4000-8000-000000000001";
const tournamentId = "11111111-1111-4111-8111-111111111111";
const screenId = "22222222-2222-4222-8222-222222222222";
const secondScreenId = "33333333-3333-4333-8333-333333333333";
const blankSceneId = "44444444-4444-4444-8444-444444444444";
const liveSceneId = "55555555-5555-4555-8555-555555555555";
const matchId = "66666666-6666-4666-8666-666666666666";
const scheduleSceneId = "77777777-7777-4777-8777-777777777777";
const finalSummarySceneId = "88888888-8888-4888-8888-888888888888";

type ScreenRow = {
  screen_id: string;
  screen_slug: string;
  display_name: string;
  tournament_id: string | null;
  description: string | null;
  public_enabled: number;
  active: number;
  created_by_user_id?: string | null;
  updated_by_user_id?: string | null;
};

type SceneRow = {
  scene_id: string;
  screen_id: string;
  scene_type: string;
  scene_name: string;
  scene_config: string;
  sort_order: number;
  active: number;
  created_by_user_id?: string | null;
  updated_by_user_id?: string | null;
};

function createDisplayScreenPool() {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const screens: ScreenRow[] = [];
  const scenes: SceneRow[] = [];
  const activeScenes = new Map<string, { scene_id: string; assigned_by_user_id: string | null; assigned_at: Date }>();

  const pool = {
    calls,
    screens,
    scenes,
    activeScenes,
    async query(sql: string, params: unknown[] = []) {
      calls.push({ sql, params });
      const compactSql = sql.replace(/\s+/g, " ").toLowerCase();

      if (compactSql.includes("from tournaments")) {
        return [params[0] === tournamentId ? [{ tournament_id: tournamentId }] : [], []];
      }

      if (compactSql.includes("insert into display_screens")) {
        if (screens.some((screen) => screen.screen_slug === params[1])) {
          const error = new Error("Duplicate slug") as Error & { code?: string; errno?: number };
          error.code = "ER_DUP_ENTRY";
          error.errno = 1062;
          throw error;
        }

        screens.push({
          screen_id: params[0] as string,
          screen_slug: params[1] as string,
          display_name: params[2] as string,
          tournament_id: params[3] as string | null,
          description: params[4] as string | null,
          public_enabled: params[5] as number,
          active: params[6] as number,
          created_by_user_id: params[7] as string,
          updated_by_user_id: params[8] as string
        });
        return [{ affectedRows: 1 }, []];
      }

      if (compactSql.includes("update display_screens")) {
        const target = screens.find((screen) => screen.screen_id === params.at(-1));
        if (!target) {
          return [{ affectedRows: 0 }, []];
        }
        target.display_name = params[0] as string;
        return [{ affectedRows: 1 }, []];
      }

      if (compactSql.includes("from display_screens ds") && compactSql.includes("where ds.screen_slug")) {
        const screen = screens.find((candidate) =>
          candidate.screen_slug === params[0] &&
          candidate.public_enabled === 1 &&
          candidate.active === 1
        );
        return [screen ? [publicDisplayRow(screen, scenes, activeScenes)] : [], []];
      }

      if (compactSql.includes("from display_screens ds") && compactSql.includes("where ds.screen_id")) {
        const screen = screens.find((candidate) => candidate.screen_id === params[0]);
        return [screen ? [publicDisplayRow(screen, scenes, activeScenes)] : [], []];
      }

      if (compactSql.includes("from display_screens") && compactSql.includes("where screen_id")) {
        const screen = screens.find((candidate) => candidate.screen_id === params[0]);
        return [screen ? [screen] : [], []];
      }

      if (compactSql.includes("from display_screens") && compactSql.includes("order by display_name")) {
        return [[...screens], []];
      }

      if (compactSql.includes("insert into display_scenes")) {
        scenes.push({
          scene_id: params[0] as string,
          screen_id: params[1] as string,
          scene_type: params[2] as string,
          scene_name: params[3] as string,
          scene_config: params[4] as string,
          sort_order: params[5] as number,
          active: params[6] as number,
          created_by_user_id: params[7] as string,
          updated_by_user_id: params[8] as string
        });
        return [{ affectedRows: 1 }, []];
      }

      if (compactSql.includes("update display_scenes")) {
        const target = scenes.find((scene) => scene.screen_id === params.at(-2) && scene.scene_id === params.at(-1));
        if (!target) {
          return [{ affectedRows: 0 }, []];
        }
        return [{ affectedRows: 1 }, []];
      }

      if (compactSql.includes("from display_scenes") && compactSql.includes("where screen_id = ? and scene_id = ?")) {
        const scene = scenes.find((candidate) => candidate.screen_id === params[0] && candidate.scene_id === params[1]);
        return [scene ? [scene] : [], []];
      }

      if (compactSql.includes("from display_scenes") && compactSql.includes("order by sort_order")) {
        return [scenes.filter((scene) => scene.screen_id === params[0]), []];
      }

      if (compactSql.includes("insert into display_screen_active_scenes")) {
        activeScenes.set(params[0] as string, {
          scene_id: params[1] as string,
          assigned_by_user_id: params[2] as string,
          assigned_at: new Date("2026-07-01T10:00:00.000Z")
        });
        return [{ affectedRows: 1 }, []];
      }

      return [[], []];
    },
    getConnection: vi.fn().mockImplementation(async () => ({
      query: (sql: string, params: unknown[] = []) => pool.query(sql, params),
      release: vi.fn()
    }))
  };

  return pool;
}

afterEach(() => {
  delete process.env.AUTH_TEST_DISABLE_CSRF;
});

describe("display screen scene foundation", () => {
  it("lets ADMIN create display screens, scenes, and active scene assignments", async () => {
    process.env.AUTH_TEST_DISABLE_CSRF = "true";
    const pool = createDisplayScreenPool();
    const app = buildApiApp({ pool: pool as never });

    try {
      const createdScreen = await app.inject({
        method: "POST",
        url: "/api/v1/display-screens",
        headers: adminHeaders(),
        payload: {
          screenId,
          screenSlug: "court-1-main",
          displayName: "Court 1 Main",
          tournamentId,
          description: "Main arena display",
          publicEnabled: true,
          active: true
        }
      });
      expect(createdScreen.statusCode).toBe(201);
      expect(createdScreen.json()).toMatchObject({
        ok: true,
        data: {
          screen: {
            screenId,
            screenSlug: "court-1-main",
            displayName: "Court 1 Main",
            tournamentId,
            publicEnabled: true,
            active: true
          }
        }
      });

      const createdScene = await app.inject({
        method: "POST",
        url: `/api/v1/display-screens/${screenId}/scenes`,
        headers: adminHeaders(),
        payload: {
          sceneId: liveSceneId,
          sceneType: "LIVE_SCOREBOARD",
          sceneName: "Live Game",
          sceneConfig: { matchId },
          sortOrder: 1,
          active: true
        }
      });
      expect(createdScene.statusCode).toBe(201);
      expect(createdScene.json()).toMatchObject({
        ok: true,
        data: {
          scene: {
            sceneId: liveSceneId,
            screenId,
            sceneType: "LIVE_SCOREBOARD",
            sceneConfig: { matchId }
          }
        }
      });

      const active = await app.inject({
        method: "POST",
        url: `/api/v1/display-screens/${screenId}/active-scene`,
        headers: adminHeaders(),
        payload: { sceneId: liveSceneId }
      });
      expect(active.statusCode).toBe(200);
      expect(active.json()).toMatchObject({
        ok: true,
        data: {
          activeScene: {
            screenId,
            scene: {
              sceneId: liveSceneId,
              sceneType: "LIVE_SCOREBOARD"
            }
          }
        }
      });
      expect(JSON.stringify(pool.calls)).not.toContain("match_events");
    } finally {
      await app.close();
    }
  });

  it("rejects duplicate slugs, invalid slugs, and non-admin writes safely", async () => {
    process.env.AUTH_TEST_DISABLE_CSRF = "true";
    const pool = createDisplayScreenPool();
    const app = buildApiApp({ pool: pool as never });

    try {
      const payload = {
        screenId,
        screenSlug: "court-1-main",
        displayName: "Court 1 Main"
      };
      expect((await app.inject({ method: "POST", url: "/api/v1/display-screens", headers: adminHeaders(), payload })).statusCode).toBe(201);

      const duplicate = await app.inject({
        method: "POST",
        url: "/api/v1/display-screens",
        headers: adminHeaders(),
        payload: { ...payload, screenId: secondScreenId }
      });
      expect(duplicate.statusCode).toBe(409);
      expect(duplicate.json()).toMatchObject({ error: { reasonCode: "DB_CONSTRAINT_ERROR" } });

      const invalidSlug = await app.inject({
        method: "POST",
        url: "/api/v1/display-screens",
        headers: adminHeaders(),
        payload: { screenSlug: "Court 1", displayName: "Court 1" }
      });
      expect(invalidSlug.statusCode).toBe(400);
      expect(invalidSlug.json()).toMatchObject({ error: { reasonCode: "VALIDATION_ERROR" } });

      const viewer = await app.inject({
        method: "POST",
        url: "/api/v1/display-screens",
        headers: { "x-dev-user-role": "VIEWER" },
        payload: { screenSlug: "viewer-screen", displayName: "Viewer Screen" }
      });
      expect(viewer.statusCode).toBe(403);
      expect(viewer.json()).toMatchObject({ error: { reasonCode: "FORBIDDEN" } });
    } finally {
      await app.close();
    }
  });

  it("requires CSRF for display screen writes", async () => {
    const app = buildApiApp({ pool: createDisplayScreenPool() as never });

    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/display-screens",
        headers: adminHeaders(),
        payload: {
          screenSlug: "csrf-screen",
          displayName: "CSRF Screen"
        }
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ error: { reasonCode: "CSRF_REQUIRED" } });
    } finally {
      await app.close();
    }
  });

  it("validates scene type, scene config, and same-screen active scene assignment", async () => {
    process.env.AUTH_TEST_DISABLE_CSRF = "true";
    const pool = createDisplayScreenPool();
    const app = buildApiApp({ pool: pool as never });

    try {
      await createScreen(app, screenId, "court-1-main");
      await createScreen(app, secondScreenId, "court-2-main");

      const invalidType = await app.inject({
        method: "POST",
        url: `/api/v1/display-screens/${screenId}/scenes`,
        headers: adminHeaders(),
        payload: {
          sceneType: "UNSAFE",
          sceneName: "Unsafe",
          sceneConfig: {}
        }
      });
      expect(invalidType.statusCode).toBe(400);

      const invalidConfig = await app.inject({
        method: "POST",
        url: `/api/v1/display-screens/${screenId}/scenes`,
        headers: adminHeaders(),
        payload: {
          sceneType: "SCHEDULE",
          sceneName: "Schedule",
          sceneConfig: { tournamentId: "not-a-uuid", limit: 99 }
        }
      });
      expect(invalidConfig.statusCode).toBe(400);

      await app.inject({
        method: "POST",
        url: `/api/v1/display-screens/${secondScreenId}/scenes`,
        headers: adminHeaders(),
        payload: {
          sceneId: blankSceneId,
          sceneType: "BLANK",
          sceneName: "Blank",
          sceneConfig: { message: "Standby" }
        }
      });

      const wrongScreenScene = await app.inject({
        method: "POST",
        url: `/api/v1/display-screens/${screenId}/active-scene`,
        headers: adminHeaders(),
        payload: { sceneId: blankSceneId }
      });
      expect(wrongScreenScene.statusCode).toBe(422);
      expect(wrongScreenScene.json()).toMatchObject({ error: { reasonCode: "VALIDATION_ERROR" } });
    } finally {
      await app.close();
    }
  });

  it("returns public scenes for all scene types without private metadata or fake data", async () => {
    process.env.AUTH_TEST_DISABLE_CSRF = "true";
    const pool = createDisplayScreenPool();
    const app = buildApiApp({ pool: pool as never });

    try {
      await createScreen(app, screenId, "court-1-main");
      await app.inject({
        method: "POST",
        url: `/api/v1/display-screens/${screenId}/scenes`,
        headers: adminHeaders(),
        payload: {
          sceneId: blankSceneId,
          sceneType: "BLANK",
          sceneName: "Blank",
          sceneConfig: { message: "Warmups" }
        }
      });
      await app.inject({
        method: "POST",
        url: `/api/v1/display-screens/${screenId}/active-scene`,
        headers: adminHeaders(),
        payload: { sceneId: blankSceneId }
      });

      const blank = await app.inject({ method: "GET", url: "/api/v1/public/display/court-1-main" });
      expect(blank.statusCode).toBe(200);
      expect(blank.json()).toMatchObject({
        ok: true,
        data: {
          screen: {
            screenSlug: "court-1-main",
            displayName: "Court 1 Main"
          },
          activeScene: {
            sceneType: "BLANK",
            publicData: { message: "Warmups" }
          }
        }
      });
      expect(blank.body).not.toMatch(publicPrivateMetadataPattern());

      await app.inject({
        method: "POST",
        url: `/api/v1/display-screens/${screenId}/scenes`,
        headers: adminHeaders(),
        payload: {
          sceneId: liveSceneId,
          sceneType: "LIVE_SCOREBOARD",
          sceneName: "Live",
          sceneConfig: { matchId }
        }
      });
      await app.inject({
        method: "POST",
        url: `/api/v1/display-screens/${screenId}/active-scene`,
        headers: adminHeaders(),
        payload: { sceneId: liveSceneId }
      });

      const live = await app.inject({ method: "GET", url: "/api/v1/public/display/court-1-main" });
      expect(live.statusCode).toBe(200);
      expect(live.json()).toMatchObject({
        data: {
          activeScene: {
            sceneType: "LIVE_SCOREBOARD",
            publicData: { matchId },
            refreshAfterMs: 2000
          }
        }
      });
      expect(live.body).not.toMatch(publicPrivateMetadataPattern());

      await app.inject({
        method: "POST",
        url: `/api/v1/display-screens/${screenId}/scenes`,
        headers: adminHeaders(),
        payload: {
          sceneId: scheduleSceneId,
          sceneType: "SCHEDULE",
          sceneName: "Safe Schedule",
          sceneConfig: { tournamentId, courtId: null, limit: 6 }
        }
      });
      await app.inject({
        method: "POST",
        url: `/api/v1/display-screens/${screenId}/active-scene`,
        headers: adminHeaders(),
        payload: { sceneId: scheduleSceneId }
      });

      const schedule = await app.inject({ method: "GET", url: "/api/v1/public/display/court-1-main" });
      expect(schedule.statusCode).toBe(200);
      expect(schedule.json()).toMatchObject({
        data: {
          activeScene: {
            sceneType: "SCHEDULE",
            publicData: { tournamentId, courtId: null, limit: 6 },
            refreshAfterMs: 15000
          }
        }
      });
      expect(schedule.body).not.toMatch(/homeTeam|awayTeam|scheduledAt|venueName|score|winner/i);
      expect(schedule.body).not.toMatch(publicPrivateMetadataPattern());

      await app.inject({
        method: "POST",
        url: `/api/v1/display-screens/${screenId}/scenes`,
        headers: adminHeaders(),
        payload: {
          sceneId: finalSummarySceneId,
          sceneType: "FINAL_SUMMARY",
          sceneName: "Safe Final Summary",
          sceneConfig: { matchId }
        }
      });
      await app.inject({
        method: "POST",
        url: `/api/v1/display-screens/${screenId}/active-scene`,
        headers: adminHeaders(),
        payload: { sceneId: finalSummarySceneId }
      });

      const finalSummary = await app.inject({ method: "GET", url: "/api/v1/public/display/court-1-main" });
      expect(finalSummary.statusCode).toBe(200);
      expect(finalSummary.json()).toMatchObject({
        data: {
          activeScene: {
            sceneType: "FINAL_SUMMARY",
            publicData: { matchId, status: "UNAVAILABLE" },
            refreshAfterMs: 30000
          }
        }
      });
      expect(finalSummary.body).not.toMatch(/homeScore|awayScore|winner|boxScore|playerStats/i);
      expect(finalSummary.body).not.toMatch(publicPrivateMetadataPattern());
    } finally {
      await app.close();
    }
  });

  it("returns controlled public 404 for unknown, inactive, or private screens", async () => {
    process.env.AUTH_TEST_DISABLE_CSRF = "true";
    const pool = createDisplayScreenPool();
    const app = buildApiApp({ pool: pool as never });

    try {
      const unknown = await app.inject({ method: "GET", url: "/api/v1/public/display/missing-screen" });
      expect(unknown.statusCode).toBe(404);
      expect(unknown.json()).toMatchObject({ error: { reasonCode: "MATCH_NOT_FOUND" } });

      await app.inject({
        method: "POST",
        url: "/api/v1/display-screens",
        headers: adminHeaders(),
        payload: {
          screenId,
          screenSlug: "private-screen",
          displayName: "Private Screen",
          publicEnabled: false
        }
      });
      const privateScreen = await app.inject({ method: "GET", url: "/api/v1/public/display/private-screen" });
      expect(privateScreen.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });
});

function publicDisplayRow(
  screen: ScreenRow,
  scenes: SceneRow[],
  activeScenes: Map<string, { scene_id: string; assigned_by_user_id: string | null; assigned_at: Date }>
) {
  const active = activeScenes.get(screen.screen_id);
  const scene = active ? scenes.find((candidate) => candidate.screen_id === screen.screen_id && candidate.scene_id === active.scene_id && candidate.active === 1) : null;
  return {
    ...screen,
    active_scene_id: scene?.scene_id ?? null,
    scene_type: scene?.scene_type ?? null,
    scene_name: scene?.scene_name ?? null,
    scene_config: scene?.scene_config ?? null,
    sort_order: scene?.sort_order ?? null,
    scene_active: scene?.active ?? null,
    assigned_at: active?.assigned_at ?? null,
    assigned_by_user_id: active?.assigned_by_user_id ?? null,
    created_by_user_id: screen.created_by_user_id,
    updated_by_user_id: screen.updated_by_user_id
  };
}

async function createScreen(app: ReturnType<typeof buildApiApp>, id: string, slug: string) {
  return app.inject({
    method: "POST",
    url: "/api/v1/display-screens",
    headers: adminHeaders(),
    payload: {
      screenId: id,
      screenSlug: slug,
      displayName: slug === "court-1-main" ? "Court 1 Main" : "Court 2 Main"
    }
  });
}

function adminHeaders() {
  return {
    "x-dev-user-role": "ADMIN",
    "x-dev-user-id": adminUserId
  };
}

function publicPrivateMetadataPattern() {
  return /assigned_by_user_id|created_by_user_id|updated_by_user_id|createdBy|updatedBy|actor|device|session|token|csrf|password|authorization|commandId|correlationId|causationId|audit|correctionDetails|\/operator|\/admin|audit-log|replay|corrections/i;
}
