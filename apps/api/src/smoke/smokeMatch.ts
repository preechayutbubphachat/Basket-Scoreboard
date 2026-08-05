import { randomUUID } from "node:crypto";
import type { CreateMatchRequest } from "@basket-scoreboard/api-contracts";
import { createMatch as createMatchService } from "../matchEventStore/createMatch.js";
import { createInitialScoreboardProjection } from "../matchEventStore/projection.js";

type QueryableConnection = {
  query: (sql: string, params?: unknown[]) => Promise<unknown>;
  release: () => void;
};

type SmokePool = {
  getConnection: () => Promise<QueryableConnection>;
};

type CreateMatchFn = (options: {
  pool: SmokePool;
  input: CreateMatchRequest;
}) => Promise<{ matchId: string; currentSeq: number }>;

export type SmokeMatchResult = {
  matchId: string;
  created: boolean;
  publicScoreboardPath: string;
  operatorScorePath: string;
};

const smokeMatchCode = "Smoke Test Match";

function getStringEnv(env: NodeJS.ProcessEnv, key: string, fallback: string) {
  const value = env[key]?.trim();
  return value ? value : fallback;
}

function firstRow<T>(queryResult: unknown): T | null {
  if (!Array.isArray(queryResult)) return null;
  const rows = queryResult[0];
  if (!Array.isArray(rows)) return null;
  return (rows[0] as T | undefined) ?? null;
}

async function findSmokeMatch(pool: SmokePool) {
  const connection = await pool.getConnection();

  try {
    const result = await connection.query(
      "SELECT match_id FROM matches WHERE match_code = ? LIMIT 1",
      [smokeMatchCode]
    );
    return firstRow<{ match_id: string }>(result)?.match_id ?? null;
  } finally {
    connection.release();
  }
}

async function createOrReuseSmokeTeam(pool: SmokePool, name: string) {
  const connection = await pool.getConnection();

  try {
    const existing = await connection.query(
      "SELECT team_id FROM teams WHERE name = ? LIMIT 1",
      [name]
    );
    const existingTeamId = firstRow<{ team_id: string }>(existing)?.team_id;
    if (existingTeamId) {
      return existingTeamId;
    }

    const teamId = randomUUID();
    await connection.query(
      "INSERT INTO teams (team_id, tournament_id, name, short_name, status, metadata) VALUES (?, NULL, ?, ?, 'ACTIVE', ?)",
      [teamId, name, name.slice(0, 40), JSON.stringify({ smokeTest: true })]
    );
    return teamId;
  } finally {
    connection.release();
  }
}

async function ensureSmokeRuntimeState(pool: SmokePool, matchId: string) {
  const connection = await pool.getConnection();
  const projection = createInitialScoreboardProjection(matchId);

  try {
    await connection.query(
      "INSERT IGNORE INTO match_streams (match_id, last_seq_no, stream_version) VALUES (?, 0, 0)",
      [matchId]
    );
    await connection.query(
      "INSERT IGNORE INTO match_projections (projection_id, match_id, projection_type, projection_version, last_event_seq, projection_data) VALUES (?, ?, 'scoreboard', 1, 0, ?)",
      [randomUUID(), matchId, JSON.stringify(projection)]
    );
  } finally {
    connection.release();
  }
}

export async function createOrReuseSmokeMatch(options: {
  pool: SmokePool;
  env?: NodeJS.ProcessEnv;
  createMatch?: CreateMatchFn;
}): Promise<SmokeMatchResult> {
  const env = options.env ?? process.env;
  const createMatch = options.createMatch ?? (createMatchService as unknown as CreateMatchFn);

  if (env.SMOKE_TEST_ENABLED !== "true") {
    throw new Error("SMOKE_TEST_ENABLED must be true to create or reuse a smoke-test match");
  }

  const existingMatchId = await findSmokeMatch(options.pool);
  const teamNames = getSmokeTeamNames(env);
  const created = !existingMatchId;
  const matchId = existingMatchId ?? (await createMatch({
    pool: options.pool,
    input: {
      matchCode: smokeMatchCode,
      homeTeamId: await createOrReuseSmokeTeam(options.pool, teamNames.homeName),
      awayTeamId: await createOrReuseSmokeTeam(options.pool, teamNames.awayName),
      scheduledAt: null,
      venueName: "Smoke Test Match",
      ruleProfileId: "FIBA_2024"
    }
  })).matchId;

  await ensureSmokeRuntimeState(options.pool, matchId);

  return {
    matchId,
    created,
    publicScoreboardPath: `/public/scoreboard/${encodeURIComponent(matchId)}`,
    operatorScorePath: `/operator/matches/${encodeURIComponent(matchId)}/score`
  };
}

export function getSmokeTeamNames(env: NodeJS.ProcessEnv = process.env) {
  return {
    homeName: getStringEnv(env, "SMOKE_TEST_HOME_NAME", "HOME"),
    awayName: getStringEnv(env, "SMOKE_TEST_AWAY_NAME", "AWAY")
  };
}

export function printSmokeMatchResult(result: SmokeMatchResult, log: (message: string) => void = console.log) {
  log(`matchId=${result.matchId}`);
  log(`publicScoreboardPath=${result.publicScoreboardPath}`);
  log(`operatorScorePath=${result.operatorScorePath}`);
  log(`created=${result.created ? "true" : "false"}`);
}
