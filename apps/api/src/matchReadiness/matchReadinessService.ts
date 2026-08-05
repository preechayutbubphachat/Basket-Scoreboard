import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import type {
  AuthoritativeTeamReadiness,
  MatchOfficialRoleCode,
  MatchOperationLinks,
  MatchReadiness
} from "@basket-scoreboard/api-contracts";
import { loadAuthoritativeRosterBaseline } from "../rosters/rosterBaselineService.js";
import type { RosterBaselineProjection, RosterReadinessState, TeamSide } from "../rosters/rosterBaselineProjection.js";
import { resolveSupportedStarterCount } from "../rosters/rosterBaselineProjection.js";

type OfficialsRow = RowDataPacket & {
  match_id: string;
  role_code: MatchOfficialRoleCode | string;
  display_name: string | null;
};

type RosterRow = RowDataPacket & {
  match_id: string;
  team_side: "HOME" | "AWAY";
  player_count: number | string | null;
  starter_count: number | string | null;
};

type ConfirmationRow = RowDataPacket & {
  match_id: string;
  team_side: "HOME" | "AWAY";
};

type MatchRuleProfileRow = RowDataPacket & {
  match_id: string;
  rule_profile_id: string | null;
};

type BaselineEventRow = RowDataPacket & {
  match_id: string;
  team_side: TeamSide;
};

type ReadinessSeed = {
  matchId: string;
  status: string;
};

type MatchSetupCounts = {
  officials: Array<{ role: MatchOfficialRoleCode | string; displayName: string | null }>;
  homeRosterCount: number;
  awayRosterCount: number;
  homeStarters: number;
  awayStarters: number;
  homeConfirmed: boolean;
  awayConfirmed: boolean;
  ruleProfile: string | null;
};

type TeamReadiness = AuthoritativeTeamReadiness & {
  source: "EVENT_BACKED_BASELINE" | "LEGACY_COMPATIBILITY_PATH";
};

export async function getReadinessForMatches(
  pool: Pool,
  matches: ReadinessSeed[]
): Promise<Map<string, MatchReadiness>> {
  if (matches.length === 0) {
    return new Map();
  }

  const matchIds = matches.map((match) => match.matchId);
  const counts = new Map<string, MatchSetupCounts>(
    matchIds.map((matchId) => [matchId, {
      officials: [],
      homeRosterCount: 0,
      awayRosterCount: 0,
      homeStarters: 0,
      awayStarters: 0,
      homeConfirmed: false,
      awayConfirmed: false,
      ruleProfile: null
    }])
  );

  const poolWithConnection = pool as Pool & { getConnection?: Pool["getConnection"] };
  const connection = typeof poolWithConnection.getConnection === "function"
    ? await poolWithConnection.getConnection()
    : pool as unknown as PoolConnection;
  try {
    const [ruleProfileRows] = await connection.query<MatchRuleProfileRow[]>(
      "SELECT match_id, rule_profile_id FROM matches WHERE match_id IN (?)",
      [matchIds]
    );
    for (const row of ruleProfileRows) {
      const target = counts.get(row.match_id);
      if (target) target.ruleProfile = row.rule_profile_id;
    }

    const [baselineEvents] = await connection.query<BaselineEventRow[]>(
      `SELECT match_id,
              JSON_UNQUOTE(JSON_EXTRACT(payload, '$.teamSide')) AS team_side
         FROM match_events
        WHERE match_id IN (?)
          AND event_type = 'MATCH_ROSTER_BASELINE_IMPORTED'`,
      [matchIds]
    );
    const baselineEventKeys = new Set(baselineEvents.map((row) => `${row.match_id}:${row.team_side}`));
    const legacyCompatibilityMatchIds = matches
      .filter((match) => !baselineEventKeys.has(`${match.matchId}:HOME`) || !baselineEventKeys.has(`${match.matchId}:AWAY`))
      .map((match) => match.matchId);
    const legacyQueryIds = legacyCompatibilityMatchIds.length > 0
      ? legacyCompatibilityMatchIds
      : ["__NO_LEGACY_COMPATIBILITY_SCOPE__"];

    const [officialRows] = await connection.query<OfficialsRow[]>(
      `SELECT
        mo.match_id,
        mo.role_code,
        COALESCE(NULLIF(u.display_name, ''), u.email, mo.user_id) AS display_name
      FROM match_officials mo
      LEFT JOIN users u ON u.user_id = mo.user_id
      WHERE mo.match_id IN (?)
        AND mo.assignment_status = 'ACTIVE'
      ORDER BY mo.match_id ASC, mo.role_code ASC, display_name ASC`,
      [matchIds]
    );
    for (const row of officialRows) {
      const target = counts.get(row.match_id);
      if (target) {
        target.officials.push({
          role: row.role_code,
          displayName: labelOrNull(row.display_name)
        });
      }
    }

    const [rosterRows] = await connection.query<RosterRow[]>(
      "SELECT match_id, team_side, COUNT(*) AS player_count, SUM(CASE WHEN is_starter = 1 THEN 1 ELSE 0 END) AS starter_count FROM match_roster_players WHERE match_id IN (?) AND roster_status <> 'INACTIVE' GROUP BY match_id, team_side",
      [legacyQueryIds]
    );
    for (const row of rosterRows) {
      const target = counts.get(row.match_id);
      if (!target) continue;
      if (row.team_side === "HOME") {
        target.homeRosterCount = numberOrDefault(row.player_count, 0);
        target.homeStarters = numberOrDefault(row.starter_count, 0);
      } else {
        target.awayRosterCount = numberOrDefault(row.player_count, 0);
        target.awayStarters = numberOrDefault(row.starter_count, 0);
      }
    }

    const [confirmationRows] = await connection.query<ConfirmationRow[]>(
      "SELECT match_id, team_side FROM match_roster_confirmations WHERE match_id IN (?)",
      [legacyQueryIds]
    );
    for (const row of confirmationRows) {
      const target = counts.get(row.match_id);
      if (!target) continue;
      if (row.team_side === "HOME") target.homeConfirmed = true;
      else target.awayConfirmed = true;
    }

    const readinessByMatch = new Map<string, MatchReadiness>();
    for (const match of matches) {
      const setup = counts.get(match.matchId)!;
      const home = await loadTeamReadiness(connection, match.matchId, "HOME", setup, setup.ruleProfile, baselineEventKeys.has(`${match.matchId}:HOME`));
      const away = await loadTeamReadiness(connection, match.matchId, "AWAY", setup, setup.ruleProfile, baselineEventKeys.has(`${match.matchId}:AWAY`));
      readinessByMatch.set(match.matchId, buildReadiness(match.status, setup.officials, home, away));
    }
    return readinessByMatch;
  } finally {
    if (typeof poolWithConnection.getConnection === "function") connection.release();
  }
}

export function buildMatchOperationLinks(matchId: string): MatchOperationLinks {
  const encoded = encodeURIComponent(matchId);
  return {
    operatorScoreUrl: `/operator/matches/${encoded}/score`,
    operatorFoulsUrl: `/operator/matches/${encoded}/fouls`,
    operatorClockUrl: `/operator/matches/${encoded}/clock`,
    operatorTimeoutsUrl: `/operator/matches/${encoded}/timeouts`,
    operatorLifecycleUrl: `/operator/matches/${encoded}/lifecycle`,
    officialsUrl: `/admin/matches/${encoded}/officials`,
    rostersUrl: `/admin/matches/${encoded}/rosters`,
    lineupUrl: `/admin/matches/${encoded}/lineup`,
    summaryUrl: `/operator/matches/${encoded}/summary`,
    replayUrl: `/operator/matches/${encoded}/replay`,
    auditLogUrl: `/operator/matches/${encoded}/audit-log`
  };
}

async function loadTeamReadiness(
  connection: PoolConnection,
  matchId: string,
  teamSide: TeamSide,
  counts: MatchSetupCounts,
  ruleProfile: string | null,
  hasBaselineEvent: boolean
): Promise<TeamReadiness> {
  if (hasBaselineEvent) {
    try {
      const recovered = await loadAuthoritativeRosterBaseline(connection, matchId, teamSide);
      return recovered ? fromEventBackedProjection(recovered.projection) : notEvaluatedTeam();
    } catch {
      return notEvaluatedTeam();
    }
  }
  if (resolveSupportedStarterCount(ruleProfile) === null) return profileUnboundTeam();
  return fromLegacyCounts(counts, teamSide);
}

function fromEventBackedProjection(projection: RosterBaselineProjection): TeamReadiness {
  const rosterCount = projection.members.filter((member) => member.rosterStatus !== "INACTIVE").length;
  const state = projection.readiness.state;
  return {
    source: "EVENT_BACKED_BASELINE",
    initialized: true,
    state,
    effective: projection.readiness.effective,
    rosterCount,
    starterCount: projection.readiness.starterCount,
    confirmed: projection.confirmation.effective,
    blockingCode: projection.readiness.effective ? null : state
  };
}

function fromLegacyCounts(counts: MatchSetupCounts, teamSide: TeamSide): TeamReadiness {
  const rosterCount = teamSide === "HOME" ? counts.homeRosterCount : counts.awayRosterCount;
  const starterCount = teamSide === "HOME" ? counts.homeStarters : counts.awayStarters;
  const confirmed = teamSide === "HOME" ? counts.homeConfirmed : counts.awayConfirmed;
  // Legacy count rows do not carry per-player eligibility state. Counts and
  // confirmation alone therefore cannot establish an authoritative READY.
  const state: RosterReadinessState = rosterCount === 0 ? "ROSTER_NOT_INITIALIZED" : "NOT_EVALUATED";
  return {
    source: "LEGACY_COMPATIBILITY_PATH",
    initialized: false,
    state,
    effective: false,
    rosterCount,
    starterCount,
    confirmed,
    blockingCode: state
  };
}

function notEvaluatedTeam(): TeamReadiness {
  return {
    source: "EVENT_BACKED_BASELINE",
    initialized: true,
    state: "NOT_EVALUATED",
    effective: false,
    rosterCount: 0,
    starterCount: 0,
    confirmed: false,
    blockingCode: "NOT_EVALUATED"
  };
}

function profileUnboundTeam(): TeamReadiness {
  return {
    source: "LEGACY_COMPATIBILITY_PATH",
    initialized: false,
    state: "NOT_EVALUATED",
    effective: false,
    rosterCount: 0,
    starterCount: 0,
    confirmed: false,
    blockingCode: "NOT_EVALUATED"
  };
}

function buildReadiness(
  status: string,
  officialsInput: Array<{ role: MatchOfficialRoleCode | string; displayName: string | null }>,
  home: TeamReadiness,
  away: TeamReadiness
): MatchReadiness {
  const rosterState = home.effective && away.effective
    ? "READY"
    : home.rosterCount > 0 || away.rosterCount > 0 ? "INCOMPLETE" : "MISSING";
  const hasLineupData = home.starterCount > 0
    || away.starterCount > 0
    || home.confirmed
    || away.confirmed;
  const lineupReady = home.state === "READY" && away.state === "READY";
  const officials = buildOfficialsReadiness(officialsInput);

  return {
    officials,
    roster: {
      state: rosterState,
      homeCount: home.rosterCount,
      awayCount: away.rosterCount
    },
    lineup: {
      state: lineupReady ? "READY" : hasLineupData ? "INCOMPLETE" : "MISSING",
      homeStarters: home.starterCount,
      awayStarters: away.starterCount,
      homeConfirmed: home.confirmed,
      awayConfirmed: away.confirmed
    },
    lifecycle: buildLifecycleReadiness(status),
    authoritativeBaseline: {
      source: home.source === "EVENT_BACKED_BASELINE" || away.source === "EVENT_BACKED_BASELINE"
        ? "EVENT_BACKED_BASELINE"
        : "LEGACY_COMPATIBILITY_PATH",
      home,
      away
    }
  };
}

function buildOfficialsReadiness(
  officials: Array<{ role: MatchOfficialRoleCode | string; displayName: string | null }>
): MatchReadiness["officials"] {
  const sortedOfficials = [...officials].sort((first, second) => {
    const roleComparison = String(first.role).localeCompare(String(second.role));
    if (roleComparison !== 0) return roleComparison;
    return (first.displayName ?? "").localeCompare(second.displayName ?? "");
  });

  if (officials.length === 0) {
    return { state: "MISSING", label: "No active officials", assignedCount: 0, roles: [] };
  }

  const normalizedRoles = sortedOfficials.map((official) => String(official.role).toUpperCase());
  const alphaReady = normalizedRoles.some((role) => role === "SCORER" || role === "REFEREE");
  const roleList = Array.from(new Set(normalizedRoles)).sort();
  const baseLabel = `${sortedOfficials.length} active official${sortedOfficials.length === 1 ? "" : "s"}: ${roleList.join(", ")}`;

  return {
    state: alphaReady ? "READY" : "PARTIAL",
    label: alphaReady ? baseLabel : `${baseLabel}. Add scorer or referee for Alpha readiness.`,
    assignedCount: sortedOfficials.length,
    roles: sortedOfficials.map((official) => ({ role: official.role, displayName: official.displayName }))
  };
}

function buildLifecycleReadiness(status: string): MatchReadiness["lifecycle"] {
  const normalized = status.toUpperCase();
  if (normalized === "SCHEDULED" || normalized === "READY") return { state: "NOT_STARTED", label: "Not started" };
  if (["LIVE", "PERIOD_BREAK", "TIMEOUT", "OVERTIME"].includes(normalized)) return { state: "LIVE", label: "Live" };
  if (["FINISHED", "FINAL"].includes(normalized)) return { state: "FINISHED", label: "Finished" };
  return { state: "UNKNOWN", label: "Unknown lifecycle state" };
}

function numberOrDefault(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function labelOrNull(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
