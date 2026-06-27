import { randomUUID } from "node:crypto";
import type { Pool } from "mysql2/promise";
import type { CreateMatchRequest } from "@basket-scoreboard/api-contracts";
import { createInitialScoreboardProjection } from "./projection.js";

export async function createMatch(options: {
  pool: Pool;
  input: CreateMatchRequest;
}): Promise<{ matchId: string; currentSeq: number }> {
  const connection = await options.pool.getConnection();
  const matchId = randomUUID();
  const projection = createInitialScoreboardProjection(matchId);

  try {
    await connection.beginTransaction();
    await connection.query(
      "INSERT INTO matches (match_id, tournament_id, home_team_id, away_team_id, match_code, status, scheduled_at, venue_name, rule_profile_id, metadata) VALUES (?, ?, ?, ?, ?, 'SCHEDULED', ?, ?, ?, ?)",
      [
        matchId,
        options.input.tournamentId ?? null,
        options.input.homeTeamId ?? null,
        options.input.awayTeamId ?? null,
        options.input.matchCode ?? null,
        options.input.scheduledAt ? new Date(options.input.scheduledAt) : null,
        options.input.venueName ?? null,
        options.input.ruleProfileId,
        JSON.stringify({})
      ]
    );
    await connection.query(
      "INSERT INTO match_streams (match_id, last_seq_no, stream_version) VALUES (?, 0, 0)",
      [matchId]
    );
    await connection.query(
      "INSERT INTO match_projections (projection_id, match_id, projection_type, projection_version, last_event_seq, projection_data) VALUES (?, ?, 'scoreboard', 1, 0, ?)",
      [randomUUID(), matchId, JSON.stringify(projection)]
    );
    await connection.commit();

    return { matchId, currentSeq: 0 };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
