import { randomUUID } from "node:crypto";
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import { ensurePlaceholderUser } from "../../apps/api/src/matchEventStore/repositories";
import {
  buildRosterBaselineProjection,
  canonicalRosterBaselineHash,
  type BaselineMember,
  type TeamSide
} from "../../apps/api/src/rosters/rosterBaselineProjection";

const FIXTURE_USER = {
  userId: "00000000-0000-4000-8000-0000000000a8",
  role: "ADMIN" as const,
  permissions: [],
  assignedMatchIds: [],
  deviceId: "authoritative-lifecycle-fixture",
  authMode: "DEV_HEADER" as const
};

export async function prepareAuthoritativeLifecycleFixture(pool: Pool, matchId: string) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await ensurePlaceholderUser(connection, FIXTURE_USER);

    const homeTeamId = randomUUID();
    const awayTeamId = randomUUID();
    await connection.query("INSERT INTO teams (team_id, name) VALUES (?, ?), (?, ?)", [
      homeTeamId,
      `Lifecycle Home ${homeTeamId}`,
      awayTeamId,
      `Lifecycle Away ${awayTeamId}`
    ]);
    await connection.query("UPDATE matches SET home_team_id = ?, away_team_id = ?, rule_profile_id = 'FIBA_2024' WHERE match_id = ?", [
      homeTeamId,
      awayTeamId,
      matchId
    ]);
    await connection.query(
      "INSERT INTO match_officials (id, match_id, user_id, role_code, assignment_status, assigned_by_user_id, assigned_at, created_at) VALUES (?, ?, ?, 'SCORER', 'ACTIVE', ?, NOW(3), NOW(3))",
      [randomUUID(), matchId, FIXTURE_USER.userId, FIXTURE_USER.userId]
    );

    const [[stream]] = await connection.query<RowDataPacket[]>("SELECT last_seq_no FROM match_streams WHERE match_id = ? FOR UPDATE", [matchId]);
    if (!stream) throw new Error(`Missing match stream for ${matchId}`);
    const currentSeq = Number(stream.last_seq_no ?? 0);
    if (currentSeq !== 0) throw new Error(`Lifecycle fixture requires an empty stream for ${matchId}`);

    for (const [teamSide, matchTeamId] of [["HOME", homeTeamId], ["AWAY", awayTeamId] as const] as Array<[TeamSide, string]>) {
      const eventSeq = teamSide === "HOME" ? 1 : 2;
      const eventId = randomUUID();
      const sourceRevision = `fixture-${matchId}-${teamSide}`;
      const members: BaselineMember[] = Array.from({ length: 5 }, (_, index) => ({
        playerId: randomUUID(),
        teamId: matchTeamId,
        displayName: `${teamSide} Fixture Player ${index + 1}`,
        jerseyNumber: String(index + 1),
        rosterStatus: "ACTIVE",
        isStarter: true,
        isCaptain: index === 0,
        eligibilityState: "ELIGIBLE"
      }));
      const canonicalPayloadHash = canonicalRosterBaselineHash({
        matchId,
        matchTeamId,
        teamSide,
        sourceRevision,
        members,
        ruleProfile: "FIBA_2024",
        rosterVersion: { eventSeq, eventId }
      });
      const version = { eventSeq, eventId, canonicalPayloadHash };
      const projection = buildRosterBaselineProjection({
        matchId,
        teamSide,
        matchTeamId,
        members,
        sourceRevision,
        version,
        ruleProfile: "FIBA_2024",
        confirmation: { confirmed: true, version }
      });
      if (!projection.readiness.effective || !projection.confirmation.effective) {
        throw new Error(`Fixture baseline did not become effective for ${teamSide}`);
      }
      const eventPayload = {
        schemaVersion: 1,
        matchId,
        teamSide,
        matchTeamId,
        members,
        source: { legacyRosterRevision: sourceRevision, importedAt: new Date().toISOString() },
        rulesProfile: "FIBA_2024",
        rosterVersion: version,
        integrity: { issues: [] },
        confirmation: { status: "VERSIONED" }
      };
      await connection.query(
        "INSERT INTO match_events (event_id, match_id, seq_no, event_type, payload, actor_user_id, actor_role, device_id, occurred_at, command_id, expected_seq, correlation_id, causation_id, reason, rule_profile_id) VALUES (?, ?, ?, 'MATCH_ROSTER_BASELINE_IMPORTED', ?, ?, ?, ?, NOW(3), ?, ?, ?, NULL, NULL, 'FIBA_2024')",
        [eventId, matchId, eventSeq, JSON.stringify(eventPayload), FIXTURE_USER.userId, FIXTURE_USER.role, FIXTURE_USER.deviceId, randomUUID(), eventSeq - 1, randomUUID()]
      );
    }
    await connection.query("UPDATE match_streams SET last_seq_no = 2 WHERE match_id = ?", [matchId]);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
