import { afterEach, describe, expect, it } from "vitest";
import { buildApiApp } from "../../apps/api/src/app";

const tournamentId = "11111111-1111-4111-8111-111111111111";
const homeTeamId = "22222222-2222-4222-8222-222222222222";
const awayTeamId = "33333333-3333-4333-8333-333333333333";

function createTournamentSetupPool() {
  const tournaments: Array<{
    tournament_id: string;
    name: string;
    status: string;
    starts_at: string | null;
    ends_at: string | null;
    metadata: string;
  }> = [];
  const teams: Array<{
    team_id: string;
    tournament_id: string | null;
    name: string;
    short_name: string | null;
    status: string;
    metadata: string;
  }> = [];
  const matches: Array<{
    match_id: string;
    tournament_id: string | null;
    home_team_id: string | null;
    away_team_id: string | null;
    match_code: string | null;
    status: string;
    scheduled_at: Date | string | null;
    venue_name: string | null;
    rule_profile_id: string;
    metadata: string;
  }> = [];
  const matchStreams: Array<{ match_id: string; last_seq_no: number; stream_version: number }> = [];
  const matchProjections: Array<{
    projection_id: string;
    match_id: string;
    projection_type: string;
    projection_version: number;
    last_event_seq: number;
    projection_data: string;
  }> = [];
  const matchEvents: unknown[] = [];
  const venues: Array<{
    venue_id: string;
    name: string;
    short_name: string | null;
    address: string | null;
    active: number;
  }> = [];
  const courts: Array<{
    court_id: string;
    venue_id: string;
    label: string;
    display_name: string | null;
    active: number;
  }> = [];

  tournaments.push({
    tournament_id: tournamentId,
    name: "Alpha Cup",
    status: "ACTIVE",
    starts_at: null,
    ends_at: null,
    metadata: "{}"
  });

  teams.push(
    {
      team_id: homeTeamId,
      tournament_id: tournamentId,
      name: "Bangkok Home",
      short_name: "BKK",
      status: "ACTIVE",
      metadata: "{}"
    },
    {
      team_id: awayTeamId,
      tournament_id: tournamentId,
      name: "Chiang Mai Away",
      short_name: "CMA",
      status: "ACTIVE",
      metadata: "{}"
    }
  );

  const pool = {
    async query(sql: string, params: unknown[] = []) {
      const normalized = sql.replace(/\s+/g, " ");

      if (normalized.includes("INSERT INTO tournaments")) {
        tournaments.push({
          tournament_id: String(params[0]),
          name: String(params[1]),
          status: String(params[2]),
          starts_at: params[3] as string | null,
          ends_at: params[4] as string | null,
          metadata: String(params[5])
        });
        return [{ affectedRows: 1 }, []];
      }

      if (normalized.includes("INSERT INTO teams")) {
        teams.push({
          team_id: String(params[0]),
          tournament_id: params[1] as string | null,
          name: String(params[2]),
          short_name: params[3] as string | null,
          status: "ACTIVE",
          metadata: String(params[4])
        });
        return [{ affectedRows: 1 }, []];
      }

      if (normalized.includes("INSERT INTO venues")) {
        const duplicate = venues.some((venue) => venue.name.toLowerCase() === String(params[1]).toLowerCase());
        if (duplicate) {
          const error = new Error("Duplicate venue") as Error & { code?: string };
          error.code = "ER_DUP_ENTRY";
          throw error;
        }
        venues.push({
          venue_id: String(params[0]),
          name: String(params[1]),
          short_name: params[2] as string | null,
          address: params[3] as string | null,
          active: 1
        });
        return [{ affectedRows: 1 }, []];
      }

      if (normalized.includes("INSERT INTO courts")) {
        const duplicate = courts.some((court) =>
          court.venue_id === params[1] && court.label.toLowerCase() === String(params[2]).toLowerCase()
        );
        if (duplicate) {
          const error = new Error("Duplicate court") as Error & { code?: string };
          error.code = "ER_DUP_ENTRY";
          throw error;
        }
        courts.push({
          court_id: String(params[0]),
          venue_id: String(params[1]),
          label: String(params[2]),
          display_name: params[3] as string | null,
          active: 1
        });
        return [{ affectedRows: 1 }, []];
      }

      if (normalized.includes("FROM venues v") && normalized.includes("LEFT JOIN courts")) {
        return [
          venues.flatMap((venue) => {
            const venueCourts = courts.filter((court) => court.venue_id === venue.venue_id);
            if (venueCourts.length === 0) {
              return [{
                venue_id: venue.venue_id,
                venue_name: venue.name,
                short_name: venue.short_name,
                address: venue.address,
                venue_active: venue.active,
                court_id: null,
                court_label: null,
                display_name: null,
                court_active: null
              }];
            }
            return venueCourts.map((court) => ({
              venue_id: venue.venue_id,
              venue_name: venue.name,
              short_name: venue.short_name,
              address: venue.address,
              venue_active: venue.active,
              court_id: court.court_id,
              court_label: court.label,
              display_name: court.display_name,
              court_active: court.active
            }));
          }),
          []
        ];
      }

      if (normalized.includes("FROM venues WHERE venue_id = ?")) {
        return [venues.filter((venue) => venue.venue_id === params[0]), []];
      }

      if (normalized.includes("FROM courts c") && normalized.includes("INNER JOIN venues v")) {
        const row = courts
          .filter((court) => court.court_id === params[0] && court.active === 1)
          .map((court) => {
            const venue = venues.find((item) => item.venue_id === court.venue_id && item.active === 1);
            return venue ? {
              court_id: court.court_id,
              venue_id: venue.venue_id,
              court_label: court.label,
              display_name: court.display_name,
              venue_name: venue.name
            } : null;
          })
          .filter(Boolean);
        return [row, []];
      }

      if (normalized.includes("SELECT team_id, tournament_id, name, short_name, status FROM teams")) {
        return [
          teams.map((team) => ({
            team_id: team.team_id,
            tournament_id: team.tournament_id,
            name: team.name,
            short_name: team.short_name,
            status: team.status
          })),
          []
        ];
      }

      if (normalized.includes("SELECT tournament_id, name, status FROM tournaments WHERE tournament_id = ?")) {
        return [tournaments.filter((tournament) => tournament.tournament_id === params[0]), []];
      }

      if (normalized.includes("SELECT team_id, tournament_id, name, status FROM teams WHERE team_id IN")) {
        const wanted = new Set(params.slice(0, 2));
        return [teams.filter((team) => wanted.has(team.team_id)), []];
      }

      if (normalized.includes("COUNT(*) AS tournament_exists")) {
        return [[{ tournament_exists: tournaments.some((tournament) => tournament.tournament_id === params[0]) ? 1 : 0 }], []];
      }

      if (normalized.includes("FROM tournaments t") && normalized.includes("match_count")) {
        return [
          tournaments.map((tournament) => ({
            tournament_id: tournament.tournament_id,
            name: tournament.name,
            status: tournament.status,
            match_count: matches.filter((match) => match.tournament_id === tournament.tournament_id).length,
            live_match_count: 0,
            finished_match_count: 0
          })),
          []
        ];
      }

      if (normalized.includes("FROM matches m") && normalized.includes("projection_data")) {
        return [
          matches
            .filter((match) => match.tournament_id === params[0])
            .map((match) => {
              const projection = matchProjections.find((item) => item.match_id === match.match_id);
              const home = teams.find((team) => team.team_id === match.home_team_id);
              const away = teams.find((team) => team.team_id === match.away_team_id);
              const metadata = JSON.parse(match.metadata || "{}") as { courtId?: string; courtLabel?: string };
              return {
                match_id: match.match_id,
                tournament_id: match.tournament_id,
                tournament_name: "Alpha Cup",
                stage_name: null,
                group_name: null,
                round_label: match.match_code,
                court_id: metadata.courtId ?? null,
                court_label: metadata.courtLabel ?? null,
                venue_label: match.venue_name,
                scheduled_at: match.scheduled_at,
                home_team_id: match.home_team_id,
                home_team_name: home?.name ?? null,
                away_team_id: match.away_team_id,
                away_team_name: away?.name ?? null,
                match_status: match.status,
                projection_data: projection?.projection_data ?? null,
                last_event_seq: projection?.last_event_seq ?? null
              };
            }),
          []
        ];
      }

      return [[], []];
    },
    async getConnection() {
      return {
        async beginTransaction() {},
        async commit() {},
        async rollback() {},
        release() {},
        async query(sql: string, params: unknown[] = []) {
          const normalized = sql.replace(/\s+/g, " ");
          if (normalized.includes("INSERT INTO matches")) {
            matches.push({
              match_id: String(params[0]),
              tournament_id: params[1] as string | null,
              home_team_id: params[2] as string | null,
              away_team_id: params[3] as string | null,
              match_code: params[4] as string | null,
              status: "SCHEDULED",
              scheduled_at: params[5] as Date | string | null,
              venue_name: params[6] as string | null,
              rule_profile_id: String(params[7]),
              metadata: String(params[8])
            });
            return [{ affectedRows: 1 }, []];
          }

          if (normalized.includes("INSERT INTO match_streams")) {
            matchStreams.push({ match_id: String(params[0]), last_seq_no: 0, stream_version: 0 });
            return [{ affectedRows: 1 }, []];
          }

          if (normalized.includes("INSERT INTO match_projections")) {
            matchProjections.push({
              projection_id: String(params[0]),
              match_id: String(params[1]),
              projection_type: "scoreboard",
              projection_version: 1,
              last_event_seq: 0,
              projection_data: String(params[2])
            });
            return [{ affectedRows: 1 }, []];
          }

          if (normalized.includes("UPDATE matches SET metadata")) {
            const match = matches.find((item) => item.match_id === params[1]);
            if (match) {
              match.metadata = String(params[0]);
            }
            return [{ affectedRows: match ? 1 : 0 }, []];
          }

          return [[], []];
        }
      };
    }
  };

  return { pool, tournaments, teams, matches, matchStreams, matchProjections, matchEvents, venues, courts };
}

afterEach(() => {
  delete process.env.AUTH_TEST_DISABLE_CSRF;
});

describe("alpha tournament data setup", () => {
  it("lets ADMIN create tournament setup rows without appending match events", async () => {
    process.env.AUTH_TEST_DISABLE_CSRF = "true";
    const store = createTournamentSetupPool();
    const app = buildApiApp({ pool: store.pool as never });

    try {
      const tournamentResponse = await app.inject({
        method: "POST",
        url: "/api/v1/tournaments",
        headers: { "x-dev-user-role": "ADMIN" },
        payload: { name: "Alpha Cup", status: "ACTIVE" }
      });
      expect(tournamentResponse.statusCode).toBe(201);
      const createdTournamentId = tournamentResponse.json<{ data: { tournament: { tournamentId: string } } }>().data.tournament.tournamentId;

      const teamResponse = await app.inject({
        method: "POST",
        url: "/api/v1/teams",
        headers: { "x-dev-user-role": "ADMIN" },
        payload: { tournamentId: createdTournamentId, name: "Phuket Sharks", shortName: "PHU" }
      });
      expect(teamResponse.statusCode).toBe(201);

      const matchResponse = await app.inject({
        method: "POST",
        url: `/api/v1/tournaments/${tournamentId}/matches`,
        headers: { "x-dev-user-role": "ADMIN" },
        payload: {
          homeTeamId,
          awayTeamId,
          scheduledAt: "2026-07-03T10:00:00.000Z",
          roundLabel: "Round 1",
          courtLabel: "Court A",
          venueLabel: "Main Hall"
        }
      });
      expect(matchResponse.statusCode).toBe(201);
      expect(matchResponse.json()).toMatchObject({
        ok: true,
        data: {
          currentSeq: 0,
          scheduleMatch: expect.objectContaining({
            tournamentId,
            homeTeamName: "Bangkok Home",
            awayTeamName: "Chiang Mai Away",
            roundLabel: "Round 1",
            courtLabel: "Court A",
            venueLabel: "Main Hall",
            status: "SCHEDULED",
            currentSeq: 0
          })
        }
      });

      expect(store.matchStreams).toHaveLength(1);
      expect(store.matchProjections).toHaveLength(1);
      expect(store.matchEvents).toHaveLength(0);

      const publicSchedule = await app.inject({
        method: "GET",
        url: `/api/v1/public/tournaments/${tournamentId}/schedule`
      });
      expect(publicSchedule.statusCode).toBe(200);
      expect(publicSchedule.json()).toMatchObject({
        data: {
          matches: [
            expect.objectContaining({
              courtLabel: "Court A",
              publicScoreboardPath: expect.stringMatching(/^\/public\/scoreboard\//)
            })
          ]
        }
      });
    } finally {
      await app.close();
    }
  });

  it("lets ADMIN create venues and courts for scheduled matches without appending match events", async () => {
    process.env.AUTH_TEST_DISABLE_CSRF = "true";
    const store = createTournamentSetupPool();
    const app = buildApiApp({ pool: store.pool as never });

    try {
      const venueResponse = await app.inject({
        method: "POST",
        url: "/api/v1/venues",
        headers: { "x-dev-user-role": "ADMIN" },
        payload: { name: "Main Hall", shortName: "MH", address: "Bangkok" }
      });
      expect(venueResponse.statusCode).toBe(201);
      const venueId = venueResponse.json<{ data: { venue: { venueId: string } } }>().data.venue.venueId;

      const courtResponse = await app.inject({
        method: "POST",
        url: `/api/v1/venues/${venueId}/courts`,
        headers: { "x-dev-user-role": "ADMIN" },
        payload: { label: "Court A", displayName: "Main Hall / Court A" }
      });
      expect(courtResponse.statusCode).toBe(201);
      const courtId = courtResponse.json<{ data: { court: { courtId: string } } }>().data.court.courtId;

      const listResponse = await app.inject({
        method: "GET",
        url: "/api/v1/venues",
        headers: { "x-dev-user-role": "ADMIN" }
      });
      expect(listResponse.statusCode).toBe(200);
      expect(listResponse.json()).toMatchObject({
        ok: true,
        data: {
          venues: [
            expect.objectContaining({
              venueId,
              name: "Main Hall",
              shortName: "MH",
              active: true,
              courts: [
                expect.objectContaining({
                  courtId,
                  label: "Court A",
                  displayName: "Main Hall / Court A",
                  active: true
                })
              ]
            })
          ]
        }
      });

      const matchResponse = await app.inject({
        method: "POST",
        url: `/api/v1/tournaments/${tournamentId}/matches`,
        headers: { "x-dev-user-role": "ADMIN" },
        payload: {
          homeTeamId,
          awayTeamId,
          scheduledAt: "2026-07-03T10:00:00.000Z",
          roundLabel: "Round 1",
          courtId
        }
      });
      expect(matchResponse.statusCode).toBe(201);
      expect(matchResponse.json()).toMatchObject({
        data: {
          scheduleMatch: expect.objectContaining({
            venueLabel: "Main Hall",
            courtLabel: "Court A"
          })
        }
      });
      expect(JSON.parse(store.matches[0].metadata)).toMatchObject({ courtId, venueId, courtLabel: "Court A" });
      expect(store.matchEvents).toHaveLength(0);
    } finally {
      await app.close();
    }
  });

  it("allows scheduled match creation with advisory court conflict warnings", async () => {
    process.env.AUTH_TEST_DISABLE_CSRF = "true";
    const store = createTournamentSetupPool();
    const app = buildApiApp({ pool: store.pool as never });

    try {
      const venueResponse = await app.inject({
        method: "POST",
        url: "/api/v1/venues",
        headers: { "x-dev-user-role": "ADMIN" },
        payload: { name: "Main Hall" }
      });
      const venueId = venueResponse.json<{ data: { venue: { venueId: string } } }>().data.venue.venueId;
      const courtResponse = await app.inject({
        method: "POST",
        url: `/api/v1/venues/${venueId}/courts`,
        headers: { "x-dev-user-role": "ADMIN" },
        payload: { label: "Court A" }
      });
      const courtId = courtResponse.json<{ data: { court: { courtId: string } } }>().data.court.courtId;

      const firstMatch = await app.inject({
        method: "POST",
        url: `/api/v1/tournaments/${tournamentId}/matches`,
        headers: { "x-dev-user-role": "ADMIN" },
        payload: {
          homeTeamId,
          awayTeamId,
          scheduledAt: "2026-07-03T10:00:00.000Z",
          courtId
        }
      });
      expect(firstMatch.statusCode).toBe(201);
      expect(firstMatch.json()).toMatchObject({
        data: {
          scheduleMatch: expect.objectContaining({
            conflicts: []
          })
        }
      });

      const secondMatch = await app.inject({
        method: "POST",
        url: `/api/v1/tournaments/${tournamentId}/matches`,
        headers: { "x-dev-user-role": "ADMIN" },
        payload: {
          homeTeamId,
          awayTeamId,
          scheduledAt: "2026-07-03T10:00:00.000Z",
          courtId
        }
      });
      expect(secondMatch.statusCode).toBe(201);
      expect(secondMatch.json()).toMatchObject({
        data: {
          scheduleMatch: expect.objectContaining({
            conflicts: [
              expect.objectContaining({
                severity: "WARNING",
                type: "SAME_COURT_SAME_TIME",
                courtId
              })
            ]
          })
        }
      });
      expect(store.matchEvents).toHaveLength(0);
    } finally {
      await app.close();
    }
  });

  it("rejects duplicate courts in one venue while allowing the same label in another venue", async () => {
    process.env.AUTH_TEST_DISABLE_CSRF = "true";
    const store = createTournamentSetupPool();
    const app = buildApiApp({ pool: store.pool as never });

    try {
      const firstVenue = await app.inject({
        method: "POST",
        url: "/api/v1/venues",
        headers: { "x-dev-user-role": "ADMIN" },
        payload: { name: "Main Hall" }
      });
      const secondVenue = await app.inject({
        method: "POST",
        url: "/api/v1/venues",
        headers: { "x-dev-user-role": "ADMIN" },
        payload: { name: "Annex" }
      });
      const firstVenueId = firstVenue.json<{ data: { venue: { venueId: string } } }>().data.venue.venueId;
      const secondVenueId = secondVenue.json<{ data: { venue: { venueId: string } } }>().data.venue.venueId;

      expect((await app.inject({
        method: "POST",
        url: `/api/v1/venues/${firstVenueId}/courts`,
        headers: { "x-dev-user-role": "ADMIN" },
        payload: { label: "Court A" }
      })).statusCode).toBe(201);

      const duplicate = await app.inject({
        method: "POST",
        url: `/api/v1/venues/${firstVenueId}/courts`,
        headers: { "x-dev-user-role": "ADMIN" },
        payload: { label: "Court A" }
      });
      expect(duplicate.statusCode).toBe(409);
      expect(duplicate.json()).toMatchObject({ error: { reasonCode: "DB_CONSTRAINT_ERROR" } });

      const sameLabelDifferentVenue = await app.inject({
        method: "POST",
        url: `/api/v1/venues/${secondVenueId}/courts`,
        headers: { "x-dev-user-role": "ADMIN" },
        payload: { label: "Court A" }
      });
      expect(sameLabelDifferentVenue.statusCode).toBe(201);
    } finally {
      await app.close();
    }
  });

  it("requires ADMIN and CSRF for venue and court setup writes", async () => {
    const store = createTournamentSetupPool();
    const app = buildApiApp({ pool: store.pool as never });

    try {
      const noCsrf = await app.inject({
        method: "POST",
        url: "/api/v1/venues",
        headers: { "x-dev-user-role": "ADMIN" },
        payload: { name: "Main Hall" }
      });
      expect(noCsrf.statusCode).toBe(403);

      process.env.AUTH_TEST_DISABLE_CSRF = "true";
      const viewer = await app.inject({
        method: "POST",
        url: "/api/v1/venues",
        headers: { "x-dev-user-role": "VIEWER" },
        payload: { name: "Main Hall" }
      });
      expect(viewer.statusCode).toBe(403);
      expect(viewer.json()).toMatchObject({ error: { reasonCode: "FORBIDDEN" } });
    } finally {
      await app.close();
    }
  });

  it("rejects invalid venue, court, and court-selected match payloads safely", async () => {
    process.env.AUTH_TEST_DISABLE_CSRF = "true";
    const store = createTournamentSetupPool();
    const app = buildApiApp({ pool: store.pool as never });

    try {
      const invalidVenue = await app.inject({
        method: "POST",
        url: "/api/v1/venues",
        headers: { "x-dev-user-role": "ADMIN" },
        payload: { name: "" }
      });
      expect(invalidVenue.statusCode).toBe(400);

      const unknownVenueCourt = await app.inject({
        method: "POST",
        url: "/api/v1/venues/99999999-9999-4999-8999-999999999999/courts",
        headers: { "x-dev-user-role": "ADMIN" },
        payload: { label: "Court A" }
      });
      expect(unknownVenueCourt.statusCode).toBe(404);

      const invalidCourtMatch = await app.inject({
        method: "POST",
        url: `/api/v1/tournaments/${tournamentId}/matches`,
        headers: { "x-dev-user-role": "ADMIN" },
        payload: { homeTeamId, awayTeamId, courtId: "99999999-9999-4999-8999-999999999999" }
      });
      expect(invalidCourtMatch.statusCode).toBe(404);
      expect(invalidCourtMatch.json()).toMatchObject({ error: { reasonCode: "MATCH_NOT_FOUND" } });
    } finally {
      await app.close();
    }
  });

  it("requires ADMIN and CSRF for tournament setup writes", async () => {
    const store = createTournamentSetupPool();
    const app = buildApiApp({ pool: store.pool as never });

    try {
      const noCsrf = await app.inject({
        method: "POST",
        url: "/api/v1/tournaments",
        headers: { "x-dev-user-role": "ADMIN" },
        payload: { name: "Alpha Cup" }
      });
      expect(noCsrf.statusCode).toBe(403);
      expect(noCsrf.json()).toMatchObject({ error: { reasonCode: "CSRF_REQUIRED" } });

      process.env.AUTH_TEST_DISABLE_CSRF = "true";
      const viewer = await app.inject({
        method: "POST",
        url: "/api/v1/tournaments",
        headers: { "x-dev-user-role": "VIEWER" },
        payload: { name: "Alpha Cup" }
      });
      expect(viewer.statusCode).toBe(403);
      expect(viewer.json()).toMatchObject({ error: { reasonCode: "FORBIDDEN" } });
    } finally {
      await app.close();
    }
  });

  it("rejects invalid tournament setup data with controlled JSON errors", async () => {
    process.env.AUTH_TEST_DISABLE_CSRF = "true";
    const store = createTournamentSetupPool();
    const app = buildApiApp({ pool: store.pool as never });

    try {
      const invalidTournament = await app.inject({
        method: "POST",
        url: "/api/v1/tournaments",
        headers: { "x-dev-user-role": "ADMIN" },
        payload: { name: "" }
      });
      expect(invalidTournament.statusCode).toBe(400);
      expect(invalidTournament.json()).toMatchObject({ error: { reasonCode: "VALIDATION_ERROR" } });

      const unknownTournament = await app.inject({
        method: "POST",
        url: "/api/v1/tournaments/99999999-9999-4999-8999-999999999999/matches",
        headers: { "x-dev-user-role": "ADMIN" },
        payload: { homeTeamId, awayTeamId }
      });
      expect(unknownTournament.statusCode).toBe(404);
      expect(unknownTournament.json()).toMatchObject({ error: { reasonCode: "MATCH_NOT_FOUND" } });

      const sameTeam = await app.inject({
        method: "POST",
        url: `/api/v1/tournaments/${tournamentId}/matches`,
        headers: { "x-dev-user-role": "ADMIN" },
        payload: { homeTeamId, awayTeamId: homeTeamId }
      });
      expect(sameTeam.statusCode).toBe(400);
      expect(sameTeam.json()).toMatchObject({ error: { reasonCode: "VALIDATION_ERROR" } });
    } finally {
      await app.close();
    }
  });
});
