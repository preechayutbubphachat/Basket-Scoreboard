import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import type {
  MatchEventType,
  MatchSummaryPlayer,
  MatchSummaryResponse,
  MatchSummaryTeam,
  RosterStatus
} from "@basket-scoreboard/api-contracts";
import { getScoreboardProjectionView, listMatchEvents, type MatchEventRecord } from "./repositories.js";

type RosterSummaryRow = RowDataPacket & {
  roster_player_id: string;
  match_id: string;
  team_side: "HOME" | "AWAY";
  team_id: string;
  player_id: string;
  display_name_snapshot: string;
  jersey_number_snapshot: string | null;
  roster_status: RosterStatus;
  is_starter: number | boolean;
  is_captain: number | boolean;
};

type SideKey = "home" | "away";

export async function getMatchSummary(options: { pool: Pool; matchId: string }): Promise<MatchSummaryResponse | null> {
  const connection = await options.pool.getConnection();

  try {
    return getMatchSummaryWithConnection(connection, options.matchId);
  } finally {
    connection.release();
  }
}

export async function getMatchSummaryWithConnection(
  connection: PoolConnection,
  matchId: string
): Promise<MatchSummaryResponse | null> {
  const projection = await getScoreboardProjectionView(connection, matchId);
  if (!projection) {
    return null;
  }

  const roster = await listSummaryRoster(connection, matchId);
  const events = await listMatchEvents(connection, matchId);
  const players = createPlayerMap(roster);
  const unattributedPoints = { home: 0, away: 0 };

  for (const event of events) {
    applyEventToSummaryPlayers(event, players, unattributedPoints);
  }

  return {
    matchId,
    status: projection.status,
    periodNumber: projection.periodNumber,
    periodType: projection.periodType ?? "REGULATION",
    currentSeq: projection.currentSeq,
    home: buildTeamSummary({
      teamId: projection.homeTeamId ?? null,
      teamName: projection.homeTeamName ?? "HOME",
      score: projection.homeScore,
      teamFouls: projection.teamFouls.home,
      timeoutsUsed: projection.timeouts?.home.used ?? 0,
      timeoutsRemaining: projection.timeouts?.home.remaining ?? 5,
      unattributedPoints: unattributedPoints.home,
      players: Array.from(players.values()).filter((player) => player.teamSide === "HOME")
    }),
    away: buildTeamSummary({
      teamId: projection.awayTeamId ?? null,
      teamName: projection.awayTeamName ?? "AWAY",
      score: projection.awayScore,
      teamFouls: projection.teamFouls.away,
      timeoutsUsed: projection.timeouts?.away.used ?? 0,
      timeoutsRemaining: projection.timeouts?.away.remaining ?? 5,
      unattributedPoints: unattributedPoints.away,
      players: Array.from(players.values()).filter((player) => player.teamSide === "AWAY")
    }),
    events: countEvents(events),
    generatedAt: new Date().toISOString()
  };
}

async function listSummaryRoster(connection: PoolConnection, matchId: string) {
  const [rows] = await connection.query<RosterSummaryRow[]>(
    "SELECT roster_player_id, match_id, team_side, team_id, player_id, display_name_snapshot, jersey_number_snapshot, roster_status, is_starter, is_captain FROM match_roster_players WHERE match_id = ? ORDER BY team_side, jersey_number_snapshot IS NULL, jersey_number_snapshot, display_name_snapshot",
    [matchId]
  );
  return rows;
}

function createPlayerMap(roster: RosterSummaryRow[]) {
  const players = new Map<string, MatchSummaryPlayer>();
  for (const row of roster) {
    players.set(row.player_id, {
      playerId: row.player_id,
      jerseyNumber: row.jersey_number_snapshot,
      displayName: row.display_name_snapshot,
      teamSide: row.team_side,
      isStarter: row.is_starter === true || row.is_starter === 1,
      isCaptain: row.is_captain === true || row.is_captain === 1,
      status: row.roster_status,
      points: 0,
      personalFouls: 0
    });
  }
  return players;
}

function applyEventToSummaryPlayers(
  event: MatchEventRecord,
  players: Map<string, MatchSummaryPlayer>,
  unattributedPoints: Record<SideKey, number>
) {
  const payload = event.payload;
  if (!payload || typeof payload !== "object") {
    return;
  }
  const data = payload as Record<string, unknown>;
  const teamSide = data.teamSide === "HOME" || data.teamSide === "AWAY" ? data.teamSide : null;
  const sideKey: SideKey | null = teamSide === "HOME" ? "home" : teamSide === "AWAY" ? "away" : null;

  if (event.eventType === "SCORE_ADDED") {
    const points = numberOrDefault(data.points, 0);
    const playerId = typeof data.playerId === "string" ? data.playerId : null;
    if (!playerId) {
      if (sideKey) unattributedPoints[sideKey] += points;
      return;
    }
    const player = getOrCreateEventPlayer(players, playerId, teamSide, data);
    player.points += points;
    return;
  }

  if (event.eventType === "PLAYER_FOUL_ADDED") {
    const playerId = typeof data.playerId === "string" ? data.playerId : null;
    if (!playerId) return;
    const player = getOrCreateEventPlayer(players, playerId, teamSide, data);
    player.personalFouls += 1;
  }
}

function getOrCreateEventPlayer(
  players: Map<string, MatchSummaryPlayer>,
  playerId: string,
  teamSide: "HOME" | "AWAY" | null,
  data: Record<string, unknown>
) {
  const existing = players.get(playerId);
  if (existing) return existing;

  const player: MatchSummaryPlayer = {
    playerId,
    jerseyNumber: stringOrNull(data.jerseyNumberSnapshot) ?? stringOrNull(data.jerseyNumber),
    displayName: stringOrNull(data.playerNameSnapshot) ?? stringOrNull(data.playerName) ?? "Unknown player",
    teamSide: teamSide ?? "HOME",
    isStarter: false,
    isCaptain: false,
    status: "ACTIVE",
    points: 0,
    personalFouls: 0
  };
  players.set(playerId, player);
  return player;
}

function buildTeamSummary(input: MatchSummaryTeam): MatchSummaryTeam {
  return {
    ...input,
    players: [...input.players].sort((left, right) => {
      const leftJersey = left.jerseyNumber ?? "";
      const rightJersey = right.jerseyNumber ?? "";
      return leftJersey.localeCompare(rightJersey, undefined, { numeric: true }) ||
        left.displayName.localeCompare(right.displayName);
    })
  };
}

function countEvents(events: MatchEventRecord[]): MatchSummaryResponse["events"] {
  return {
    total: events.length,
    scoreEvents: countBy(events, ["SCORE_ADDED"]),
    foulEvents: countBy(events, ["TEAM_FOUL_ADDED", "PLAYER_FOUL_ADDED"]),
    timeoutEvents: countBy(events, ["TIMEOUT_GRANTED", "TIMEOUT_ENDED"]),
    lifecycleEvents: countBy(events, ["MATCH_STARTED", "PERIOD_STARTED", "PERIOD_ENDED", "OVERTIME_STARTED", "MATCH_FINISHED"]),
    correctionEvents: countBy(events, [
      "CORRECTION_REQUESTED",
      "SCORE_REMOVED_BY_CORRECTION",
      "CORRECTION_APPLIED",
      "CORRECTION_REJECTED",
      "SCORE_CORRECTED",
      "TEAM_FOUL_CORRECTED",
      "PLAYER_FOUL_CORRECTED",
      "TIMEOUT_CORRECTED",
      "GAME_CLOCK_CORRECTED",
      "SHOT_CLOCK_CORRECTED"
    ])
  };
}

function countBy(events: MatchEventRecord[], eventTypes: MatchEventType[]) {
  const accepted = new Set<string>(eventTypes);
  return events.filter((event) => accepted.has(event.eventType)).length;
}

function numberOrDefault(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function stringOrNull(value: unknown) {
  return typeof value === "string" ? value : null;
}
