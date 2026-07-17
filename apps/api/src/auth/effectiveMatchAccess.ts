import type { Pool, RowDataPacket } from "mysql2/promise";
import type {
  EffectiveMatchAccess,
  EffectiveMatchCapabilities,
  PermissionCode
} from "@basket-scoreboard/api-contracts";
import { evaluateAuthorization, type AuthenticatedUser } from "./sessionAuth.js";

type CountRow = RowDataPacket & { count: number | string };

const capabilityPermissions = {
  matchRead: "match.read",
  scoreOperate: "match.score.operate",
  foulOperate: "match.foul.operate",
  gameClockOperate: "match.clock.game.operate",
  shotClockOperate: "match.clock.shot.operate",
  timeoutOperate: "match.timeout.operate",
  lifecycleOperate: "match.lifecycle.operate",
  correctionRequest: "match.correction.request",
  correctionApply: "match.correction.apply",
  correctionReject: "match.correction.reject",
  auditRead: "match.audit.read"
} as const satisfies Record<keyof EffectiveMatchCapabilities, PermissionCode>;

export async function matchExists(pool: Pool, matchId: string) {
  const [rows] = await pool.query<CountRow[]>(
    "SELECT COUNT(*) AS count FROM matches WHERE match_id = ?",
    [matchId]
  );
  return Number(rows[0]?.count ?? 0) > 0;
}

export async function buildEffectiveMatchAccess(
  pool: Pool,
  user: AuthenticatedUser,
  matchId: string
): Promise<EffectiveMatchAccess> {
  const entries = await Promise.all(
    Object.entries(capabilityPermissions).map(async ([capability, permission]) => {
      const decision = await evaluateAuthorization(pool, user, permission, { matchId });
      return [capability, decision.allowed] as const;
    })
  );

  return {
    matchId,
    capabilities: Object.fromEntries(entries) as EffectiveMatchCapabilities
  };
}
