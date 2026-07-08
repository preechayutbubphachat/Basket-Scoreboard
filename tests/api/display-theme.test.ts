import { afterEach, describe, expect, it } from "vitest";
import { buildApiApp } from "../../apps/api/src/app";
import { resolvePublicDisplayTheme } from "../../apps/api/src/displayThemes/displayThemeService";

const tournamentId = "11111111-1111-4111-8111-111111111111";
const homeTeamId = "22222222-2222-4222-8222-222222222222";
const awayTeamId = "33333333-3333-4333-8333-333333333333";
const matchId = "44444444-4444-4444-8444-444444444444";
const adminUserId = "00000000-0000-4000-8000-000000000001";

function createDisplayThemePool(options: { ownerExists?: boolean } = {}) {
  const ownerExists = options.ownerExists ?? true;
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  let tournamentTheme: Record<string, unknown> | null = null;
  let homeProfile: Record<string, unknown> | null = null;
  let awayProfile: Record<string, unknown> | null = null;
  let matchOverride: Record<string, unknown> | null = null;

  const pool = {
    calls,
    async query(sql: string, params: unknown[] = []) {
      calls.push({ sql, params });

      if (sql.includes("FROM tournaments") && sql.includes("LIMIT 1") && !sql.includes("JOIN")) {
        return [ownerExists && params[0] === tournamentId ? [{ tournament_id: tournamentId }] : [], []];
      }

      if (sql.includes("FROM teams") && sql.includes("LIMIT 1") && !sql.includes("JOIN")) {
        return [ownerExists && (params[0] === homeTeamId || params[0] === awayTeamId) ? [{ team_id: params[0] }] : [], []];
      }

      if (sql.includes("FROM matches") && sql.includes("LIMIT 1") && !sql.includes("JOIN")) {
        return [ownerExists && params[0] === matchId ? [{ match_id: matchId }] : [], []];
      }

      if (sql.includes("INSERT INTO tournament_display_themes")) {
        tournamentTheme = {
          tournament_id: params[0],
          display_name: params[1],
          logo_url: params[2],
          primary_color: params[3],
          secondary_color: params[4],
          accent_color: params[5],
          text_color: params[6],
          background_style: params[7],
          show_tournament_logo: params[8],
          active: params[9]
        };
        return [{ affectedRows: 1 }, []];
      }

      if (sql.includes("INSERT INTO team_display_profiles")) {
        const row = {
          team_id: params[0],
          display_name: params[1],
          logo_url: params[2],
          primary_color: params[3],
          secondary_color: params[4],
          accent_color: params[5],
          text_color: params[6],
          show_team_logo: params[7],
          active: params[8]
        };
        if (params[0] === homeTeamId) {
          homeProfile = row;
        } else {
          awayProfile = row;
        }
        return [{ affectedRows: 1 }, []];
      }

      if (sql.includes("INSERT INTO match_display_overrides")) {
        matchOverride = {
          match_id: params[0],
          home_primary_color: params[1],
          home_secondary_color: params[2],
          home_accent_color: params[3],
          home_text_color: params[4],
          away_primary_color: params[5],
          away_secondary_color: params[6],
          away_accent_color: params[7],
          away_text_color: params[8],
          show_team_logos: params[9],
          text_only_fallback: params[10],
          neutral_high_contrast: params[11],
          emergency_override_enabled: params[12],
          emergency_reason: params[13]
        };
        return [{ affectedRows: 1 }, []];
      }

      if (sql.includes("FROM tournament_display_themes")) {
        return [tournamentTheme && params[0] === tournamentId ? [tournamentTheme] : [], []];
      }

      if (sql.includes("FROM team_display_profiles")) {
        if (params[0] === homeTeamId) {
          return [homeProfile ? [homeProfile] : [], []];
        }
        return [awayProfile ? [awayProfile] : [], []];
      }

      if (sql.includes("FROM match_display_overrides")) {
        return [matchOverride && params[0] === matchId ? [matchOverride] : [], []];
      }

      if (sql.includes("FROM matches m")) {
        return [
          ownerExists && params[0] === matchId
            ? [
                {
                  match_id: matchId,
                  tournament_id: tournamentId,
                  tournament_name: "Youth Cup",
                  home_team_id: homeTeamId,
                  home_team_name: "Bangkok Tigers",
                  away_team_id: awayTeamId,
                  away_team_name: "Phuket Sharks"
                }
              ]
            : [],
          []
        ];
      }

      return [[], []];
    }
  };

  return pool;
}

afterEach(() => {
  delete process.env.AUTH_TEST_DISABLE_CSRF;
});

describe("display branding theme foundation", () => {
  it("lets ADMIN get and update tournament display theme", async () => {
    process.env.AUTH_TEST_DISABLE_CSRF = "true";
    const pool = createDisplayThemePool();
    const app = buildApiApp({ pool: pool as never });

    try {
      const getDefault = await app.inject({
        method: "GET",
        url: `/api/v1/tournaments/${tournamentId}/display-theme`,
        headers: { "x-dev-user-role": "ADMIN" }
      });
      expect(getDefault.statusCode).toBe(200);
      expect(getDefault.json()).toMatchObject({
        ok: true,
        data: {
          theme: {
            tournamentId,
            displayName: null,
            backgroundStyle: "DEFAULT_ARENA",
            showTournamentLogo: true,
            active: true
          }
        }
      });

      const putTheme = await app.inject({
        method: "PUT",
        url: `/api/v1/tournaments/${tournamentId}/display-theme`,
        headers: { "x-dev-user-role": "ADMIN" },
        payload: {
          displayName: "Youth Championship",
          logoUrl: "https://cdn.example.com/logo.png",
          primaryColor: "#112233",
          secondaryColor: "#445566",
          accentColor: "#ffaa00",
          textColor: "#ffffff",
          backgroundStyle: "DARK_GRADIENT",
          showTournamentLogo: true,
          active: true
        }
      });

      expect(putTheme.statusCode).toBe(200);
      expect(putTheme.json()).toMatchObject({
        ok: true,
        data: {
          theme: {
            tournamentId,
            displayName: "Youth Championship",
            logoUrl: "https://cdn.example.com/logo.png",
            primaryColor: "#112233",
            backgroundStyle: "DARK_GRADIENT"
          }
        }
      });
      expect(pool.calls.some((call) => call.sql.includes("INSERT INTO tournament_display_themes"))).toBe(true);
      expect(JSON.stringify(pool.calls)).not.toContain("match_events");
    } finally {
      await app.close();
    }
  });

  it("requires CSRF and ADMIN for display theme writes", async () => {
    const pool = createDisplayThemePool();
    const app = buildApiApp({ pool: pool as never });

    try {
      const noCsrf = await app.inject({
        method: "PUT",
        url: `/api/v1/tournaments/${tournamentId}/display-theme`,
        headers: { "x-dev-user-role": "ADMIN" },
        payload: { displayName: "Blocked" }
      });
      expect(noCsrf.statusCode).toBe(403);
      expect(noCsrf.json()).toMatchObject({ error: { reasonCode: "CSRF_REQUIRED" } });

      process.env.AUTH_TEST_DISABLE_CSRF = "true";
      const viewer = await app.inject({
        method: "PUT",
        url: `/api/v1/tournaments/${tournamentId}/display-theme`,
        headers: { "x-dev-user-role": "VIEWER" },
        payload: { displayName: "Blocked" }
      });
      expect(viewer.statusCode).toBe(403);
      expect(viewer.json()).toMatchObject({ error: { reasonCode: "FORBIDDEN" } });
    } finally {
      await app.close();
    }
  });

  it("rejects invalid colors, unsafe logo URLs, and unknown owners safely", async () => {
    process.env.AUTH_TEST_DISABLE_CSRF = "true";
    const app = buildApiApp({ pool: createDisplayThemePool({ ownerExists: false }) as never });

    try {
      const invalidColor = await app.inject({
        method: "PUT",
        url: `/api/v1/tournaments/${tournamentId}/display-theme`,
        headers: { "x-dev-user-role": "ADMIN" },
        payload: { primaryColor: "red" }
      });
      expect(invalidColor.statusCode).toBe(400);
      expect(invalidColor.json()).toMatchObject({ error: { reasonCode: "VALIDATION_ERROR" } });

      const unsafeLogo = await app.inject({
        method: "PUT",
        url: `/api/v1/tournaments/${tournamentId}/display-theme`,
        headers: { "x-dev-user-role": "ADMIN" },
        payload: { logoUrl: "javascript:alert(1)" }
      });
      expect(unsafeLogo.statusCode).toBe(400);
      expect(unsafeLogo.json()).toMatchObject({ error: { reasonCode: "VALIDATION_ERROR" } });

      const unknown = await app.inject({
        method: "GET",
        url: `/api/v1/tournaments/${tournamentId}/display-theme`,
        headers: { "x-dev-user-role": "ADMIN" }
      });
      expect(unknown.statusCode).toBe(404);
      expect(unknown.json()).toMatchObject({ error: { reasonCode: "MATCH_NOT_FOUND" } });
    } finally {
      await app.close();
    }
  });

  it("lets ADMIN get and update team profiles and match overrides", async () => {
    process.env.AUTH_TEST_DISABLE_CSRF = "true";
    const pool = createDisplayThemePool();
    const app = buildApiApp({ pool: pool as never });

    try {
      const team = await app.inject({
        method: "PUT",
        url: `/api/v1/teams/${homeTeamId}/display-profile`,
        headers: { "x-dev-user-role": "ADMIN" },
        payload: {
          displayName: "Tigers",
          logoUrl: "/assets/tigers.png",
          primaryColor: "#cc0000",
          showTeamLogo: true
        }
      });
      expect(team.statusCode).toBe(200);
      expect(team.json()).toMatchObject({
        ok: true,
        data: { profile: { teamId: homeTeamId, displayName: "Tigers", logoUrl: "/assets/tigers.png" } }
      });

      const override = await app.inject({
        method: "PUT",
        url: `/api/v1/matches/${matchId}/display-override`,
        headers: { "x-dev-user-role": "ADMIN" },
        payload: {
          homePrimaryColor: "#ff0000",
          awayPrimaryColor: "#0000ff",
          neutralHighContrast: true,
          emergencyOverrideEnabled: true,
          emergencyReason: "Match day visibility"
        }
      });
      expect(override.statusCode).toBe(200);
      expect(override.json()).toMatchObject({
        ok: true,
        data: {
          override: {
            matchId,
            home: { primaryColor: "#ff0000" },
            away: { primaryColor: "#0000ff" },
            neutralHighContrast: true,
            emergencyOverrideEnabled: true,
            emergencyReason: "Match day visibility"
          }
        }
      });
    } finally {
      await app.close();
    }
  });

  it("resolves public display theme with precedence and without private metadata", async () => {
    const pool = createDisplayThemePool();
    await pool.query("INSERT INTO tournament_display_themes", [
      tournamentId,
      "Youth Cup Display",
      "https://cdn.example.com/tournament.png",
      "#111111",
      "#222222",
      "#333333",
      "#ffffff",
      "DARK_GRADIENT",
      1,
      1,
      adminUserId,
      adminUserId
    ]);
    await pool.query("INSERT INTO team_display_profiles", [
      homeTeamId,
      "Tigers",
      "https://cdn.example.com/tigers.png",
      "#cc0000",
      null,
      "#ffcc00",
      "#ffffff",
      1,
      1,
      adminUserId,
      adminUserId
    ]);
    await pool.query("INSERT INTO team_display_profiles", [
      awayTeamId,
      "Sharks",
      "https://cdn.example.com/sharks.png",
      "#0033cc",
      null,
      "#00ccff",
      "#ffffff",
      1,
      1,
      adminUserId,
      adminUserId
    ]);
    await pool.query("INSERT INTO match_display_overrides", [
      matchId,
      "#ff0000",
      null,
      null,
      null,
      "#0000ff",
      null,
      null,
      null,
      1,
      0,
      0,
      1,
      "Private match-day note",
      adminUserId,
      adminUserId
    ]);

    const theme = await resolvePublicDisplayTheme(pool as never, matchId);
    expect(theme).toMatchObject({
      tournament: {
        displayName: "Youth Cup Display",
        logoUrl: "https://cdn.example.com/tournament.png",
        backgroundStyle: "DARK_GRADIENT"
      },
      home: {
        displayName: "Tigers",
        logoUrl: "https://cdn.example.com/tigers.png",
        colors: { primaryColor: "#ff0000", accentColor: "#ffcc00" }
      },
      away: {
        displayName: "Sharks",
        logoUrl: "https://cdn.example.com/sharks.png",
        colors: { primaryColor: "#0000ff", accentColor: "#00ccff" }
      },
      flags: {
        textOnlyFallback: false,
        neutralHighContrast: false
      }
    });

    const serialized = JSON.stringify(theme);
    expect(serialized).not.toContain("Private match-day note");
    expect(serialized).not.toMatch(/created_by_user_id|updated_by_user_id|emergency_reason|commandId|correlationId|causationId|csrf|token|audit|correctionDetails/i);
  });

  it("returns text-only public fallback when match override requires it", async () => {
    const pool = createDisplayThemePool();
    await pool.query("INSERT INTO match_display_overrides", [
      matchId,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      1,
      1,
      1,
      0,
      null,
      adminUserId,
      adminUserId
    ]);

    const theme = await resolvePublicDisplayTheme(pool as never, matchId);
    expect(theme).toMatchObject({
      home: { displayName: "Bangkok Tigers", logoUrl: null, showLogo: false },
      away: { displayName: "Phuket Sharks", logoUrl: null, showLogo: false },
      flags: { textOnlyFallback: true, neutralHighContrast: true }
    });
  });
});
