import { z } from "zod";

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.literal("basket-scoreboard-api")
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const reasonCodes = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  UNAUTHORIZED: "UNAUTHORIZED",
  UNAUTHENTICATED: "UNAUTHENTICATED",
  FORBIDDEN: "FORBIDDEN",
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  USER_INACTIVE: "USER_INACTIVE",
  SESSION_EXPIRED: "SESSION_EXPIRED",
  SESSION_REVOKED: "SESSION_REVOKED",
  CSRF_REQUIRED: "CSRF_REQUIRED",
  CSRF_INVALID: "CSRF_INVALID",
  MATCH_NOT_ASSIGNED: "MATCH_NOT_ASSIGNED",
  USER_REQUIRED: "USER_REQUIRED",
  USER_NOT_FOUND: "USER_NOT_FOUND",
  ROLE_REQUIRED: "ROLE_REQUIRED",
  INVALID_OFFICIAL_ROLE: "INVALID_OFFICIAL_ROLE",
  ASSIGNMENT_NOT_FOUND: "ASSIGNMENT_NOT_FOUND",
  ASSIGNMENT_INACTIVE: "ASSIGNMENT_INACTIVE",
  DUPLICATE_ASSIGNMENT: "DUPLICATE_ASSIGNMENT",
  REASON_REQUIRED: "REASON_REQUIRED",
  INSUFFICIENT_PERMISSION: "INSUFFICIENT_PERMISSION",
  DEV_AUTH_DISABLED: "DEV_AUTH_DISABLED",
  MATCH_NOT_FOUND: "MATCH_NOT_FOUND",
  INVALID_EXPECTED_SEQ: "INVALID_EXPECTED_SEQ",
  DUPLICATE_COMMAND: "DUPLICATE_COMMAND",
  DB_CONSTRAINT_ERROR: "DB_CONSTRAINT_ERROR",
  INTERNAL_ERROR: "INTERNAL_ERROR"
} as const;

export type ReasonCode = (typeof reasonCodes)[keyof typeof reasonCodes];

export type ApiErrorResponse = {
  error: {
    reasonCode: ReasonCode;
    message: string;
    details?: unknown;
  };
};

export type RoleCode = "ADMIN" | "SCORER" | "REFEREE" | "VIEWER";

export type MatchOfficialRoleCode =
  | "REFEREE"
  | "SCORER"
  | "ASSISTANT_SCORER"
  | "TIMER"
  | "SHOT_CLOCK_OPERATOR"
  | "MATCH_OPERATOR";

export type MatchAssignment = {
  id: string;
  matchId: string;
  userId: string;
  displayName?: string | null;
  roleCode: MatchOfficialRoleCode;
  assignmentStatus: "ACTIVE" | "REVOKED" | string;
  assignedAt: string;
  revokedAt: string | null;
};

export type OfficialCandidate = {
  userId: string;
  displayName: string | null;
  roles: RoleCode[];
};

export type OperatorMatchSummary = {
  matchId: string;
  matchCode: string | null;
  tournamentId?: string | null;
  tournamentName?: string | null;
  homeTeamId: string | null;
  homeTeamName: string | null;
  awayTeamId: string | null;
  awayTeamName: string | null;
  status: string;
  scheduledAt: string | null;
  venueName: string | null;
  venueLabel?: string | null;
  courtLabel?: string | null;
  assignedRoleCodes: MatchOfficialRoleCode[];
  currentSeq: number;
  homeScore: number | null;
  awayScore: number | null;
  readiness?: MatchReadiness;
};

export const playerPositionSchema = z.enum(["GUARD", "FORWARD", "CENTER", "UNKNOWN"]);
export const rosterStatusSchema = z.enum(["ACTIVE", "BENCH", "INACTIVE"]);

export const createPlayerSchema = z.object({
  playerId: z.string().uuid().optional(),
  displayName: z.string().trim().min(1).max(200),
  jerseyNumber: z.string().trim().min(1).max(12).nullable().optional(),
  position: playerPositionSchema.default("UNKNOWN"),
  active: z.boolean().default(true)
});

export const updatePlayerSchema = z.object({
  displayName: z.string().trim().min(1).max(200).optional(),
  jerseyNumber: z.string().trim().min(1).max(12).nullable().optional(),
  position: playerPositionSchema.optional(),
  active: z.boolean().optional()
});

export const assignRosterPlayerSchema = z.object({
  playerId: z.string().uuid()
});

export const updateRosterPlayerSchema = z.object({
  status: rosterStatusSchema,
  isStarter: z.boolean(),
  isCaptain: z.boolean()
});

export const lineupActionSchema = z.object({
  expectedSeq: z.number().int().min(0).nullable().optional(),
  commandId: z.string().uuid().nullable().optional(),
  reason: z.string().trim().max(500).nullable().optional()
});

export type PlayerPosition = z.infer<typeof playerPositionSchema>;
export type RosterStatus = z.infer<typeof rosterStatusSchema>;
export type CreatePlayerRequest = z.infer<typeof createPlayerSchema>;
export type UpdatePlayerRequest = z.infer<typeof updatePlayerSchema>;
export type AssignRosterPlayerRequest = z.infer<typeof assignRosterPlayerSchema>;
export type UpdateRosterPlayerRequest = z.infer<typeof updateRosterPlayerSchema>;
export type LineupActionRequest = z.infer<typeof lineupActionSchema>;

export type PlayerRecord = {
  playerId: string;
  teamId: string;
  displayName: string;
  jerseyNumber: string | null;
  position: PlayerPosition;
  active: boolean;
  createdAt?: string;
  updatedAt?: string | null;
};

export type MatchRosterPlayer = {
  rosterPlayerId: string;
  matchId: string;
  teamSide: "HOME" | "AWAY";
  teamId: string;
  playerId: string;
  displayNameSnapshot: string;
  jerseyNumberSnapshot: string | null;
  position: PlayerPosition;
  status: RosterStatus;
  isStarter: boolean;
  isCaptain: boolean;
};

export type RosterReadiness = {
  playerCount: number;
  starterCount: number;
  captainSet: boolean;
  confirmed: boolean;
  ready: boolean;
};

export type MatchRostersResponse = {
  matchId: string;
  rosters: {
    HOME: MatchRosterPlayer[];
    AWAY: MatchRosterPlayer[];
  };
  readiness?: {
    home: RosterReadiness;
    away: RosterReadiness;
  };
};

export type LineupTeamResponse = {
  teamId: string | null;
  teamName: string | null;
  players: MatchRosterPlayer[];
  readiness: RosterReadiness;
};

export type MatchLineupResponse = {
  matchId: string;
  home: LineupTeamResponse;
  away: LineupTeamResponse;
};

export type MatchSummaryPlayer = {
  playerId: string;
  jerseyNumber: string | null;
  displayName: string;
  teamSide: "HOME" | "AWAY";
  isStarter: boolean;
  isCaptain: boolean;
  status: RosterStatus | string;
  points: number;
  personalFouls: number;
};

export type MatchSummaryTeam = {
  teamId: string | null;
  teamName: string;
  score: number;
  teamFouls: number;
  timeoutsUsed: number;
  timeoutsRemaining: number;
  unattributedPoints: number;
  players: MatchSummaryPlayer[];
};

export type MatchSummaryResponse = {
  matchId: string;
  status: string;
  periodNumber: number;
  periodType: string;
  currentSeq: number;
  home: MatchSummaryTeam;
  away: MatchSummaryTeam;
  events: {
    total: number;
    scoreEvents: number;
    foulEvents: number;
    timeoutEvents: number;
    lifecycleEvents: number;
    correctionEvents: number;
  };
  generatedAt: string;
};

export const replayGroupFilterSchema = z.enum([
  "all",
  "score",
  "foul",
  "timeout",
  "clock",
  "lifecycle",
  "correction"
]);

export const replayQuerySchema = z.object({
  group: replayGroupFilterSchema.default("all"),
  limit: z.coerce.number().int().min(1).default(300).transform((value) => Math.min(value, 500)),
  afterSeq: z.coerce.number().int().min(0).optional(),
  beforeSeq: z.coerce.number().int().min(0).optional()
});

export type ReplayGroupFilter = z.infer<typeof replayGroupFilterSchema>;
export type ReplayEventGroup =
  | "SCORE"
  | "FOUL"
  | "TIMEOUT"
  | "CLOCK"
  | "LIFECYCLE"
  | "CORRECTION"
  | "OTHER";

export type CorrectionDetail = {
  correctedEventSeq: number | null;
  correctedEventType: string | null;
  correctionKind: string | null;
  reason: string | null;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  delta: Record<string, unknown> | null;
};

export type ReplayItem = {
  matchId: string;
  seq: number;
  eventType: string;
  eventGroup: ReplayEventGroup;
  periodNumber: number | null;
  periodType: string | null;
  teamSide: "HOME" | "AWAY" | null;
  title: string;
  description: string;
  scoreAfter: {
    home: number;
    away: number;
  } | null;
  player: {
    playerId: string | null;
    displayName: string;
    jerseyNumber: string | null;
  } | null;
  actor: {
    userId: string | null;
    displayName: string | null;
    role: string | null;
  } | null;
  correctionDetails?: CorrectionDetail | null;
  createdAt: string;
};

export type MatchReplayResponse = {
  matchId: string;
  status: string;
  currentSeq: number;
  homeTeamName: string;
  awayTeamName: string;
  group: ReplayGroupFilter;
  limit: number;
  items: ReplayItem[];
  generatedAt: string;
};

export const auditLogGroupFilterSchema = z.enum([
  "all",
  "score",
  "foul",
  "clock",
  "shot_clock",
  "timeout",
  "lifecycle",
  "roster_lineup",
  "correction",
  "rejected",
  "other"
]);

export const auditLogQuerySchema = z.object({
  group: auditLogGroupFilterSchema.default("all"),
  limit: z.coerce.number().int().min(1).default(300).transform((value) => Math.min(value, 500)),
  afterSeq: z.coerce.number().int().min(0).optional(),
  beforeSeq: z.coerce.number().int().min(0).optional(),
  actorId: z.string().trim().min(1).max(100).optional(),
  eventType: z.string().trim().min(1).max(100).optional(),
  hasReason: z.coerce.boolean().optional()
});

export type AuditLogGroupFilter = z.infer<typeof auditLogGroupFilterSchema>;
export type AuditLogRowGroup =
  | "SCORE"
  | "FOUL"
  | "CLOCK"
  | "SHOT_CLOCK"
  | "TIMEOUT"
  | "LIFECYCLE"
  | "ROSTER_LINEUP"
  | "CORRECTION"
  | "AUTH"
  | "OTHER";

export type AuditLogRow = {
  matchId: string;
  seq: number | null;
  source: "MATCH_EVENT" | "AUDIT_LOG" | "COMMAND_RESULT" | "UNKNOWN";
  group: AuditLogRowGroup;
  eventType: string;
  status: "APPENDED" | "REJECTED" | "CORRECTED" | "INFO" | "UNKNOWN";
  title: string;
  description: string;
  actor: {
    userId: string | null;
    displayName: string | null;
    role: string | null;
  };
  device: {
    label: string | null;
    ipMasked: string | null;
    userAgentSummary: string | null;
  };
  reason: string | null;
  commandId: string | null;
  correlationId: string | null;
  causationId: string | null;
  correctionDetails?: CorrectionDetail | null;
  createdAt: string;
};

export type MatchAuditLogResponse = {
  matchId: string;
  status: string;
  currentSeq: number;
  group: AuditLogGroupFilter;
  limit: number;
  rows: AuditLogRow[];
  summary: {
    totalRows: number;
    eventRows: number;
    correctionRows: number;
    rejectedRows: number;
    missingReasonRows: number;
  };
  generatedAt: string;
};

export type TournamentSummary = {
  tournamentId: string;
  name: string;
  status: string;
  matchCount: number;
  liveMatchCount: number;
  finishedMatchCount: number;
};

export type TournamentSetupStatus = "DRAFT" | "ACTIVE" | "COMPLETED" | "ARCHIVED";

export type TournamentSetupTeam = {
  teamId: string;
  tournamentId: string | null;
  name: string;
  shortName: string | null;
  status: string;
};

export type VenueCourt = {
  courtId: string;
  label: string;
  displayName: string | null;
  active: boolean;
};

export type VenueSummary = {
  venueId: string;
  name: string;
  shortName: string | null;
  address: string | null;
  active: boolean;
  courts: VenueCourt[];
};

export type ScheduleConflictWarning = {
  conflictId: string;
  severity: "WARNING";
  type: "SAME_COURT_SAME_TIME" | "LEGACY_SAME_COURT_SAME_TIME";
  message: string;
  matchId: string;
  conflictingMatchId: string;
  scheduledAt: string;
  courtId: string | null;
  venueLabel: string | null;
  courtLabel: string | null;
};

export type MatchReadinessState = "READY" | "PARTIAL" | "MISSING" | "UNKNOWN" | "INCOMPLETE";
export type MatchLifecycleReadinessState = "NOT_STARTED" | "LIVE" | "FINISHED" | "UNKNOWN";

export type MatchReadiness = {
  officials: {
    state: "READY" | "PARTIAL" | "MISSING" | "UNKNOWN";
    label: string;
    assignedCount?: number;
    roles?: Array<{
      role: MatchOfficialRoleCode | string;
      displayName: string | null;
    }>;
  };
  roster: {
    state: "READY" | "INCOMPLETE" | "MISSING";
    homeCount: number;
    awayCount: number;
  };
  lineup: {
    state: "READY" | "INCOMPLETE" | "MISSING";
    homeStarters: number;
    awayStarters: number;
    homeConfirmed: boolean;
    awayConfirmed: boolean;
  };
  lifecycle: {
    state: MatchLifecycleReadinessState;
    label: string;
  };
};

export type MatchOperationLinks = {
  operatorScoreUrl: string;
  operatorFoulsUrl: string;
  operatorClockUrl: string;
  operatorTimeoutsUrl: string;
  operatorLifecycleUrl: string;
  officialsUrl: string;
  rostersUrl: string;
  lineupUrl: string;
  summaryUrl: string;
  replayUrl: string;
  auditLogUrl: string;
};

export type TournamentScheduleMatch = {
  matchId: string;
  tournamentId: string | null;
  stageName: string | null;
  groupName: string | null;
  roundLabel: string | null;
  courtId: string | null;
  courtLabel: string | null;
  venueLabel: string | null;
  scheduledAt: string | null;
  homeTeamId: string | null;
  homeTeamName: string;
  awayTeamId: string | null;
  awayTeamName: string;
  status: string;
  periodNumber?: number;
  periodType?: string;
  gameClockRemainingMs?: number;
  gameClockRunning?: boolean;
  shotClockRemainingMs?: number | null;
  shotClockRunning?: boolean;
  homeScore: number;
  awayScore: number;
  currentSeq: number;
  publicScoreboardPath: string;
  conflicts?: ScheduleConflictWarning[];
  operations?: MatchOperationLinks;
  readiness?: MatchReadiness;
};

export type TournamentListResponse = {
  tournaments: TournamentSummary[];
};

export type TeamListResponse = {
  teams: TournamentSetupTeam[];
};

export type VenueListResponse = {
  venues: VenueSummary[];
};

export type TournamentScheduleResponse = {
  tournament: TournamentSummary;
  matches: TournamentScheduleMatch[];
  generatedAt: string;
};

export type LiveDashboardWarning = {
  code: string;
  label: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
};

export type LiveDashboardMatchLinks = {
  score: string;
  fouls: string;
  clock: string;
  timeouts: string;
  corrections: string;
  summary: string;
  replay: string;
  auditLog: string;
  publicScoreboard: string;
};

export type LiveDashboardMatchItem = {
  matchId: string;
  tournamentId: string;
  homeTeamName: string;
  awayTeamName: string;
  venueLabel: string | null;
  courtLabel: string | null;
  scheduledAt: string | null;
  status: string;
  period: number;
  periodType: string;
  homeScore: number;
  awayScore: number;
  gameClockRemainingMs: number;
  gameClockRunning: boolean;
  shotClockRemainingMs: number | null;
  shotClockRunning: boolean;
  currentSeq: number;
  readiness: MatchReadiness | null;
  warnings: LiveDashboardWarning[];
  links: LiveDashboardMatchLinks;
};

export type TournamentLiveDashboardResponse = {
  tournamentId: string;
  tournament: TournamentSummary;
  generatedAt: string;
  matches: LiveDashboardMatchItem[];
};

export type TournamentStandingsTieStatus = "CLEAR" | "TIE_UNRESOLVED";

export type TournamentStandingsRow = {
  teamId: string;
  teamName: string;
  played: number;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  pointDifferential: number;
  finishedMatchesCounted: number;
  liveMatchesExcluded: number;
  scheduledMatchesExcluded: number;
  tieStatus: TournamentStandingsTieStatus;
};

export type TournamentStandingsResponse = {
  tournamentId: string;
  tournamentName: string;
  status: string;
  isOfficial: false;
  rulesNotice: string;
  generatedAt: string;
  rows: TournamentStandingsRow[];
  summary: {
    teamCount: number;
    finishedMatchCount: number;
    excludedMatchCount: number;
  };
};

export type DisplayBackgroundStyle = "DEFAULT_ARENA" | "SOLID" | "DARK_GRADIENT" | "HIGH_CONTRAST";

export type DisplayColors = {
  primaryColor: string | null;
  secondaryColor: string | null;
  accentColor: string | null;
  textColor: string | null;
};

export type TournamentDisplayThemeResponse = DisplayColors & {
  tournamentId: string;
  displayName: string | null;
  logoUrl: string | null;
  backgroundStyle: DisplayBackgroundStyle;
  showTournamentLogo: boolean;
  active: boolean;
};

export type TeamDisplayProfileResponse = DisplayColors & {
  teamId: string;
  displayName: string | null;
  logoUrl: string | null;
  showTeamLogo: boolean;
  active: boolean;
};

export type MatchDisplayOverrideResponse = {
  matchId: string;
  home: DisplayColors;
  away: DisplayColors;
  showTeamLogos: boolean;
  textOnlyFallback: boolean;
  neutralHighContrast: boolean;
  emergencyOverrideEnabled: boolean;
  emergencyReason: string | null;
};

export type PublicDisplayResolvedTeam = {
  displayName: string;
  logoUrl: string | null;
  showLogo: boolean;
  colors: DisplayColors;
};

export type PublicDisplayTheme = {
  tournament: {
    displayName: string | null;
    logoUrl: string | null;
    showLogo: boolean;
    backgroundStyle: DisplayBackgroundStyle;
    colors: DisplayColors;
  };
  home: PublicDisplayResolvedTeam;
  away: PublicDisplayResolvedTeam;
  flags: {
    textOnlyFallback: boolean;
    neutralHighContrast: boolean;
  };
};

export type DisplaySceneType = "LIVE_SCOREBOARD" | "SCHEDULE" | "FINAL_SUMMARY" | "BLANK";

export type LiveScoreboardSceneConfig = {
  matchId: string;
};

export type ScheduleSceneConfig = {
  tournamentId: string;
  courtId?: string | null | undefined;
  limit?: number | undefined;
};

export type PublicScheduleDisplayStatus = "SCHEDULED" | "LIVE" | "FINAL";

export type PublicScheduleDisplayRow = {
  matchId: string;
  scheduledAt: string | null;
  homeTeamName: string;
  awayTeamName: string;
  status: PublicScheduleDisplayStatus;
  courtLabel: string | null;
  venueLabel: string | null;
  tournamentLabel: string;
  stageLabel: string | null;
  roundLabel: string | null;
};

export type PublicScheduleDisplayProjection = {
  tournamentLabel: string;
  rows: PublicScheduleDisplayRow[];
  emptyMessage: string | null;
};

export type FinalSummarySceneConfig = {
  matchId: string;
};

export type PublicFinalSummary = {
  matchId: string;
  status: "FINAL";
  homeTeamName: string;
  awayTeamName: string;
  homeScore: number;
  awayScore: number;
  winnerSide: "HOME" | "AWAY" | null;
  winnerDisplayName: string | null;
  tournamentLabel: string | null;
  roundLabel: string | null;
  venueLabel: string | null;
  courtLabel: string | null;
  completedAt: string | null;
};

export type PublicFinalSummaryUnavailable = {
  matchId: string;
  status: "UNAVAILABLE";
  message: string;
};

export type PublicFinalSummaryProjection = PublicFinalSummary | PublicFinalSummaryUnavailable;

export type BlankSceneConfig = {
  message?: string | null | undefined;
};

export type DisplaySceneConfig =
  | LiveScoreboardSceneConfig
  | ScheduleSceneConfig
  | FinalSummarySceneConfig
  | BlankSceneConfig;

export type DisplayScreenResponse = {
  screenId: string;
  screenSlug: string;
  displayName: string;
  tournamentId: string | null;
  description: string | null;
  publicEnabled: boolean;
  active: boolean;
};

export type DisplaySceneResponse = {
  sceneId: string;
  screenId: string;
  sceneType: DisplaySceneType;
  sceneName: string;
  sceneConfig: DisplaySceneConfig;
  sortOrder: number;
  active: boolean;
};

export type ActiveDisplaySceneResponse = {
  screenId: string;
  scene: DisplaySceneResponse;
  assignedAt: string;
};

export type PublicDisplayScreenResponse = {
  ok: true;
  data: {
    screen: {
      screenSlug: string;
      displayName: string;
    };
    activeScene: {
      sceneType: DisplaySceneType;
      publicData: unknown;
      refreshAfterMs: number;
    };
    serverTime: string;
  };
};

export type SmokeMatchResponse = {
  matchId: string;
  created: boolean;
  publicScoreboardPath: string;
  operatorScorePath: string;
};

export type PermissionCode =
  | "match.create"
  | "match.read"
  | "match.score.operate"
  | "match.foul.operate"
  | "match.clock.game.operate"
  | "match.clock.shot.operate"
  | "match.timeout.operate"
  | "match.lifecycle.operate"
  | "match.correction.request"
  | "match.correction.apply"
  | "match.correction.reject"
  | "match.audit.read"
  | "public.scoreboard.read";

export type MatchOperatorPermission =
  | "match.score.operate"
  | "match.foul.operate"
  | "match.clock.game.operate"
  | "match.clock.shot.operate"
  | "match.timeout.operate"
  | "match.lifecycle.operate";

export const matchOperatorPermissions: readonly MatchOperatorPermission[] = [
  "match.score.operate",
  "match.foul.operate",
  "match.clock.game.operate",
  "match.clock.shot.operate",
  "match.timeout.operate",
  "match.lifecycle.operate"
];

export function assignmentRoleAllowsPermission(roleCode: string, permission: PermissionCode) {
  if (permission === "match.read") return true;

  const operatorPermissionsByAssignment: Partial<Record<MatchOfficialRoleCode, readonly MatchOperatorPermission[]>> = {
    SCORER: ["match.score.operate", "match.foul.operate"],
    ASSISTANT_SCORER: ["match.score.operate", "match.foul.operate"],
    TIMER: ["match.clock.game.operate"],
    SHOT_CLOCK_OPERATOR: ["match.clock.shot.operate"],
    MATCH_OPERATOR: matchOperatorPermissions
  };

  if (matchOperatorPermissions.includes(permission as MatchOperatorPermission)) {
    return operatorPermissionsByAssignment[roleCode as MatchOfficialRoleCode]?.includes(
      permission as MatchOperatorPermission
    ) ?? false;
  }

  if (permission === "match.correction.request") {
    return ["SCORER", "ASSISTANT_SCORER", "MATCH_OPERATOR", "REFEREE"].includes(roleCode);
  }

  if (permission === "match.correction.apply" || permission === "match.correction.reject") {
    return roleCode === "REFEREE";
  }

  return false;
}

export type AuthenticatedUser = {
  userId: string;
  email?: string;
  displayName?: string;
  role: RoleCode;
  roles?: RoleCode[];
  permissions: PermissionCode[];
  assignedMatchIds: string[];
  matchAssignments?: MatchAssignment[];
  deviceId: string;
  authMode: "DEV_HEADER" | "SESSION";
  sessionId?: string;
  csrfToken?: string;
};

export type AuthContext = {
  user: AuthenticatedUser | null;
};

export type AuthorizationDecision = {
  allowed: boolean;
  reasonCode?: ReasonCode;
  message?: string;
};

export const createMatchSchema = z.object({
  matchCode: z.string().min(1).max(80).nullable().optional(),
  tournamentId: z.string().uuid().nullable().optional(),
  homeTeamId: z.string().uuid().nullable().optional(),
  awayTeamId: z.string().uuid().nullable().optional(),
  scheduledAt: z.string().datetime().nullable().optional(),
  venueName: z.string().max(200).nullable().optional(),
  ruleProfileId: z.string().min(1).max(80).default("FIBA_2024"),
  metadata: z.record(z.unknown()).optional()
});

export const createTournamentSchema = z.object({
  name: z.string().trim().min(1).max(200),
  status: z.enum(["DRAFT", "ACTIVE", "COMPLETED", "ARCHIVED"]).default("ACTIVE"),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional()
});

export const createTeamSchema = z.object({
  tournamentId: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(1).max(200),
  shortName: z.string().trim().min(1).max(40).nullable().optional()
});

export const createVenueSchema = z.object({
  name: z.string().trim().min(1).max(200),
  shortName: z.string().trim().min(1).max(80).nullable().optional(),
  address: z.string().trim().min(1).max(500).nullable().optional()
});

export const createCourtSchema = z.object({
  label: z.string().trim().min(1).max(80),
  displayName: z.string().trim().min(1).max(120).nullable().optional()
});

export const createTournamentMatchSchema = z.object({
  homeTeamId: z.string().uuid(),
  awayTeamId: z.string().uuid(),
  scheduledAt: z.string().datetime().nullable().optional(),
  courtId: z.string().uuid().nullable().optional(),
  roundLabel: z.string().trim().min(1).max(80).nullable().optional(),
  courtLabel: z.string().trim().min(1).max(80).nullable().optional(),
  venueLabel: z.string().trim().min(1).max(200).nullable().optional()
}).refine((value) => value.homeTeamId !== value.awayTeamId, {
  message: "Home and away teams must be different",
  path: ["awayTeamId"]
});

export const displayBackgroundStyleSchema = z.enum([
  "DEFAULT_ARENA",
  "SOLID",
  "DARK_GRADIENT",
  "HIGH_CONTRAST"
]);

const displayColorSchema = z.string().trim().regex(/^#[0-9A-Fa-f]{6}$/);

const nullableDisplayColorSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? null : value),
  displayColorSchema.nullable().optional()
);

const safeLogoUrlSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? null : value),
  z.string()
    .trim()
    .max(1024)
    .refine((value) => !/[\u0000-\u001F\u007F<>]/.test(value), "Logo URL contains unsafe characters")
    .refine((value) => {
      const lower = value.toLowerCase();
      return !lower.startsWith("javascript:") && !lower.startsWith("data:");
    }, "Logo URL scheme is not allowed")
    .refine((value) => {
      if (value.startsWith("/assets/")) {
        return true;
      }

      try {
        const parsed = new URL(value);
        return parsed.protocol === "https:" && parsed.username === "" && parsed.password === "";
      } catch {
        return false;
      }
    }, "Logo URL must be https or a safe public asset path")
    .nullable()
    .optional()
);

const nullableDisplayName = (maxLength: number) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? null : value),
    z.string().trim().min(1).max(maxLength).nullable().optional()
  );

const displayColorsInputShape = {
  primaryColor: nullableDisplayColorSchema,
  secondaryColor: nullableDisplayColorSchema,
  accentColor: nullableDisplayColorSchema,
  textColor: nullableDisplayColorSchema
};

export const tournamentDisplayThemeSchema = z.object({
  displayName: nullableDisplayName(120),
  logoUrl: safeLogoUrlSchema,
  ...displayColorsInputShape,
  backgroundStyle: displayBackgroundStyleSchema.default("DEFAULT_ARENA"),
  showTournamentLogo: z.boolean().default(true),
  active: z.boolean().default(true)
});

export const teamDisplayProfileSchema = z.object({
  displayName: nullableDisplayName(80),
  logoUrl: safeLogoUrlSchema,
  ...displayColorsInputShape,
  showTeamLogo: z.boolean().default(true),
  active: z.boolean().default(true)
});

export const matchDisplayOverrideSchema = z.object({
  homePrimaryColor: nullableDisplayColorSchema,
  homeSecondaryColor: nullableDisplayColorSchema,
  homeAccentColor: nullableDisplayColorSchema,
  homeTextColor: nullableDisplayColorSchema,
  awayPrimaryColor: nullableDisplayColorSchema,
  awaySecondaryColor: nullableDisplayColorSchema,
  awayAccentColor: nullableDisplayColorSchema,
  awayTextColor: nullableDisplayColorSchema,
  showTeamLogos: z.boolean().default(true),
  textOnlyFallback: z.boolean().default(false),
  neutralHighContrast: z.boolean().default(false),
  emergencyOverrideEnabled: z.boolean().default(false),
  emergencyReason: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? null : value),
    z.string().trim().max(255).nullable().optional()
  )
});

const displayScreenSlugSchema = z.string()
  .trim()
  .min(3)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

const nullableDisplayDescriptionSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? null : value),
  z.string().trim().max(255).nullable().optional()
);

export const displaySceneTypeSchema = z.enum(["LIVE_SCOREBOARD", "SCHEDULE", "FINAL_SUMMARY", "BLANK"]);

export const liveScoreboardSceneConfigSchema = z.object({
  matchId: z.string().uuid()
});

export const scheduleSceneConfigSchema = z.object({
  tournamentId: z.string().uuid(),
  courtId: z.string().uuid().nullable().optional(),
  limit: z.number().int().min(1).max(20).default(8)
});

export const finalSummarySceneConfigSchema = z.object({
  matchId: z.string().uuid()
});

export const blankSceneConfigSchema = z.object({
  message: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? null : value),
    z.string().trim().max(120).nullable().optional()
  )
});

const displaySceneConfigSchemaByType = {
  LIVE_SCOREBOARD: liveScoreboardSceneConfigSchema,
  SCHEDULE: scheduleSceneConfigSchema,
  FINAL_SUMMARY: finalSummarySceneConfigSchema,
  BLANK: blankSceneConfigSchema
} as const;

export function parseDisplaySceneConfig(sceneType: DisplaySceneType, sceneConfig: unknown) {
  return displaySceneConfigSchemaByType[sceneType].parse(sceneConfig);
}

export const createDisplayScreenSchema = z.object({
  screenId: z.string().uuid().optional(),
  screenSlug: displayScreenSlugSchema,
  displayName: z.string().trim().min(1).max(120),
  tournamentId: z.string().uuid().nullable().optional(),
  description: nullableDisplayDescriptionSchema,
  publicEnabled: z.boolean().default(true),
  active: z.boolean().default(true)
});

export const updateDisplayScreenSchema = createDisplayScreenSchema
  .omit({ screenId: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0, "At least one screen field is required");

const displaySceneInputBaseSchema = z.object({
  sceneId: z.string().uuid().optional(),
  sceneType: displaySceneTypeSchema,
  sceneName: z.string().trim().min(1).max(120),
  sceneConfig: z.unknown(),
  sortOrder: z.number().int().min(0).max(1000).default(0),
  active: z.boolean().default(true)
});

export const createDisplaySceneSchema = displaySceneInputBaseSchema.superRefine((value, context) => {
  const result = displaySceneConfigSchemaByType[value.sceneType].safeParse(value.sceneConfig);
  if (!result.success) {
    for (const issue of result.error.issues) {
      context.addIssue({
        ...issue,
        path: ["sceneConfig", ...issue.path]
      });
    }
  }
});

export const updateDisplaySceneSchema = displaySceneInputBaseSchema
  .omit({ sceneId: true })
  .partial()
  .superRefine((value, context) => {
    if (Object.keys(value).length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one scene field is required"
      });
      return;
    }

    if (value.sceneConfig !== undefined) {
      if (!value.sceneType) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["sceneType"],
          message: "sceneType is required when sceneConfig is provided"
        });
        return;
      }

      const result = displaySceneConfigSchemaByType[value.sceneType].safeParse(value.sceneConfig);
      if (!result.success) {
        for (const issue of result.error.issues) {
          context.addIssue({
            ...issue,
            path: ["sceneConfig", ...issue.path]
          });
        }
      }
    }
  });

export const activeDisplaySceneSchema = z.object({
  sceneId: z.string().uuid()
});

export const scoreAddedPayloadSchema = z.object({
  teamSide: z.enum(["HOME", "AWAY"]),
  points: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  playerId: z.string().uuid().nullable(),
  playerNameSnapshot: z.string().max(200).nullable().optional(),
  jerseyNumberSnapshot: z.string().max(12).nullable().optional(),
  periodNumber: z.number().int().positive(),
  gameClockRemainingMs: z.number().int().min(0),
  note: z.string().max(500).nullable()
});

export const foulTypeSchema = z.enum([
  "PERSONAL",
  "TECHNICAL",
  "UNSPORTSMANLIKE",
  "DISQUALIFYING",
  "OTHER"
]);

export const teamFoulAddedPayloadSchema = z.object({
  teamSide: z.enum(["HOME", "AWAY"]),
  foulType: foulTypeSchema,
  reason: z.string().max(500).nullable()
});

export const playerFoulAddedPayloadSchema = teamFoulAddedPayloadSchema.extend({
  playerId: z.string().uuid()
});

export const gameClockSetPayloadSchema = z.object({
  remainingMs: z.number().int().min(0).max(600000),
  reason: z.string().max(500).nullable()
});

export const shotClockResetPayloadSchema = z.object({
  resetToMs: z.union([z.literal(24000), z.literal(14000)]),
  reason: z.string().max(500).nullable()
});

export const shotClockSetPayloadSchema = z.object({
  remainingMs: z.number().int().min(0).max(24000),
  reason: z.string().max(500).nullable()
});

export const timeoutRequestedBySchema = z.enum([
  "HEAD_COACH",
  "ASSISTANT_COACH",
  "BENCH",
  "OFFICIAL",
  "OTHER"
]);

export const timeoutGrantedPayloadSchema = z.object({
  teamSide: z.enum(["HOME", "AWAY"]),
  requestedBy: timeoutRequestedBySchema,
  durationMs: z.number().int().min(1000).max(120000).default(60000),
  reason: z.string().max(500).nullable()
});

export const timeoutEndedPayloadSchema = z.object({
  reason: z.string().max(500).nullable()
});

export const lifecycleCommandPayloadSchema = z.object({
  reason: z.string().max(500).nullable()
});

export const correctionRequestPayloadSchema = z.object({
  targetSeq: z.number().int().positive(),
  correctionType: z.literal("SCORE_CORRECTION"),
  reason: z.string().trim().min(1).max(500),
  note: z.string().max(500).nullable()
});

export const applyScoreCorrectionPayloadSchema = z.object({
  correctionRequestSeq: z.number().int().positive(),
  targetSeq: z.number().int().positive(),
  reason: z.string().trim().min(1).max(500),
  removeOriginalScore: z.boolean(),
  replacement: scoreAddedPayloadSchema.nullable()
});

export const rejectCorrectionPayloadSchema = z.object({
  correctionRequestSeq: z.number().int().positive(),
  reason: z.string().trim().min(1).max(500)
});

export const alphaCorrectionKindSchema = z.enum([
  "SCORE_UNDO",
  "TEAM_FOUL_UNDO",
  "PLAYER_FOUL_UNDO",
  "TIMEOUT_UNDO",
  "GAME_CLOCK_SET_CORRECTION",
  "SHOT_CLOCK_SET_CORRECTION"
]);

export const alphaCorrectionPayloadSchema = z.object({
  correctionKind: alphaCorrectionKindSchema,
  target: z.record(z.unknown()).default({}),
  delta: z.record(z.unknown()).nullable().default(null),
  newValue: z.record(z.unknown()).nullable().default(null)
});

export const addScoreCommandSchema = z.object({
  commandId: z.string().uuid(),
  matchId: z.string().uuid(),
  expectedSeq: z.number().int().min(0),
  correlationId: z.string().uuid(),
  clientTimestamp: z.string().datetime(),
  payload: scoreAddedPayloadSchema
});

const commandEnvelopeBaseSchema = z.object({
  commandId: z.string().uuid(),
  matchId: z.string().uuid(),
  expectedSeq: z.number().int().min(0),
  correlationId: z.string().uuid(),
  clientTimestamp: z.string().datetime()
});

export const correctionRequestCommandSchema = commandEnvelopeBaseSchema.extend({
  payload: correctionRequestPayloadSchema
});

export const addTeamFoulCommandSchema = commandEnvelopeBaseSchema.extend({
  payload: teamFoulAddedPayloadSchema
});

export const addPlayerFoulCommandSchema = commandEnvelopeBaseSchema.extend({
  payload: playerFoulAddedPayloadSchema
});

export const gameClockStartCommandSchema = commandEnvelopeBaseSchema.extend({
  payload: z.object({}).default({})
});

export const gameClockStopCommandSchema = commandEnvelopeBaseSchema.extend({
  payload: z.object({}).default({})
});

export const gameClockSetCommandSchema = commandEnvelopeBaseSchema.extend({
  payload: gameClockSetPayloadSchema
});

export const shotClockResetCommandSchema = commandEnvelopeBaseSchema.extend({
  payload: shotClockResetPayloadSchema
});

export const shotClockSetCommandSchema = commandEnvelopeBaseSchema.extend({
  payload: shotClockSetPayloadSchema
});

export const timeoutGrantCommandSchema = commandEnvelopeBaseSchema.extend({
  payload: timeoutGrantedPayloadSchema
});

export const timeoutEndCommandSchema = commandEnvelopeBaseSchema.extend({
  payload: timeoutEndedPayloadSchema
});

export const lifecycleCommandSchema = commandEnvelopeBaseSchema.extend({
  payload: lifecycleCommandPayloadSchema
});

export const applyScoreCorrectionCommandSchema = commandEnvelopeBaseSchema.extend({
  payload: applyScoreCorrectionPayloadSchema
});

export const rejectCorrectionCommandSchema = commandEnvelopeBaseSchema.extend({
  payload: rejectCorrectionPayloadSchema
});

export const alphaCorrectionCommandSchema = commandEnvelopeBaseSchema.extend({
  correctedEventSeq: z.number().int().positive(),
  correctionKind: alphaCorrectionKindSchema,
  reason: z.string().trim().min(5).max(500),
  payload: alphaCorrectionPayloadSchema
}).refine((command) => command.correctionKind === command.payload.correctionKind, {
  message: "payload.correctionKind must match correctionKind",
  path: ["payload", "correctionKind"]
});

export const eligibleCorrectionEventsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  eventTypes: z.string().optional()
});

export const syncQuerySchema = z.object({
  lastEventSeq: z.coerce.number().int().min(0).default(0)
});

export const realtimeViewSchema = z.enum(["PUBLIC_SCOREBOARD", "OPERATOR"]);

export const matchJoinPayloadSchema = z.object({
  matchId: z.string().uuid(),
  lastSeq: z.number().int().min(0).optional(),
  view: realtimeViewSchema
});

export const commandResultStatusSchema = z.enum([
  "ACCEPTED",
  "REJECTED",
  "DUPLICATE_ACCEPTED",
  "SYNC_REQUIRED"
]);

export type CreateMatchRequest = z.infer<typeof createMatchSchema>;
export type CreateTournamentRequest = z.infer<typeof createTournamentSchema>;
export type CreateTeamRequest = z.infer<typeof createTeamSchema>;
export type CreateVenueRequest = z.infer<typeof createVenueSchema>;
export type CreateCourtRequest = z.infer<typeof createCourtSchema>;
export type CreateTournamentMatchRequest = z.infer<typeof createTournamentMatchSchema>;
export type TournamentDisplayThemeInput = z.infer<typeof tournamentDisplayThemeSchema>;
export type TeamDisplayProfileInput = z.infer<typeof teamDisplayProfileSchema>;
export type MatchDisplayOverrideInput = z.infer<typeof matchDisplayOverrideSchema>;
export type CreateDisplayScreenInput = z.infer<typeof createDisplayScreenSchema>;
export type UpdateDisplayScreenInput = z.infer<typeof updateDisplayScreenSchema>;
export type CreateDisplaySceneInput = z.infer<typeof createDisplaySceneSchema>;
export type UpdateDisplaySceneInput = z.infer<typeof updateDisplaySceneSchema>;
export type ActiveDisplaySceneInput = z.infer<typeof activeDisplaySceneSchema>;
export type ScoreAddedPayload = z.infer<typeof scoreAddedPayloadSchema>;
export type FoulType = z.infer<typeof foulTypeSchema>;
export type TeamFoulAddedPayload = z.infer<typeof teamFoulAddedPayloadSchema>;
export type PlayerFoulAddedPayload = z.infer<typeof playerFoulAddedPayloadSchema>;
export type GameClockSetPayload = z.infer<typeof gameClockSetPayloadSchema>;
export type ShotClockResetPayload = z.infer<typeof shotClockResetPayloadSchema>;
export type ShotClockSetPayload = z.infer<typeof shotClockSetPayloadSchema>;
export type TimeoutRequestedBy = z.infer<typeof timeoutRequestedBySchema>;
export type TimeoutGrantedPayload = z.infer<typeof timeoutGrantedPayloadSchema>;
export type TimeoutEndedPayload = z.infer<typeof timeoutEndedPayloadSchema>;
export type LifecycleCommandPayload = z.infer<typeof lifecycleCommandPayloadSchema>;
export type AddScoreCommand = z.infer<typeof addScoreCommandSchema>;
export type AddTeamFoulCommand = z.infer<typeof addTeamFoulCommandSchema>;
export type AddPlayerFoulCommand = z.infer<typeof addPlayerFoulCommandSchema>;
export type GameClockStartCommand = z.infer<typeof gameClockStartCommandSchema>;
export type GameClockStopCommand = z.infer<typeof gameClockStopCommandSchema>;
export type GameClockSetCommand = z.infer<typeof gameClockSetCommandSchema>;
export type ShotClockResetCommand = z.infer<typeof shotClockResetCommandSchema>;
export type ShotClockSetCommand = z.infer<typeof shotClockSetCommandSchema>;
export type TimeoutGrantCommand = z.infer<typeof timeoutGrantCommandSchema>;
export type TimeoutEndCommand = z.infer<typeof timeoutEndCommandSchema>;
export type LifecycleCommand = z.infer<typeof lifecycleCommandSchema>;
export type CorrectionRequestPayload = z.infer<typeof correctionRequestPayloadSchema>;
export type ApplyScoreCorrectionPayload = z.infer<typeof applyScoreCorrectionPayloadSchema>;
export type RejectCorrectionPayload = z.infer<typeof rejectCorrectionPayloadSchema>;
export type CorrectionRequestCommand = z.infer<typeof correctionRequestCommandSchema>;
export type ApplyScoreCorrectionCommand = z.infer<typeof applyScoreCorrectionCommandSchema>;
export type RejectCorrectionCommand = z.infer<typeof rejectCorrectionCommandSchema>;
export type AlphaCorrectionKind = z.infer<typeof alphaCorrectionKindSchema>;
export type AlphaCorrectionCommand = z.infer<typeof alphaCorrectionCommandSchema>;
export type EligibleCorrectionEventsQuery = z.infer<typeof eligibleCorrectionEventsQuerySchema>;
export type CommandResultStatus = z.infer<typeof commandResultStatusSchema>;
export type RealtimeView = z.infer<typeof realtimeViewSchema>;
export type MatchJoinPayload = z.infer<typeof matchJoinPayloadSchema>;

export type MatchEventType =
  | "MATCH_STARTED"
  | "PERIOD_STARTED"
  | "PERIOD_ENDED"
  | "OVERTIME_STARTED"
  | "MATCH_FINISHED"
  | "SCORE_ADDED"
  | "TEAM_FOUL_ADDED"
  | "PLAYER_FOUL_ADDED"
  | "GAME_CLOCK_STARTED"
  | "GAME_CLOCK_STOPPED"
  | "GAME_CLOCK_SET"
  | "SHOT_CLOCK_RESET"
  | "SHOT_CLOCK_SET"
  | "TIMEOUT_GRANTED"
  | "TIMEOUT_ENDED"
  | "CORRECTION_REQUESTED"
  | "SCORE_REMOVED_BY_CORRECTION"
  | "CORRECTION_APPLIED"
  | "CORRECTION_REJECTED"
  | "SCORE_CORRECTED"
  | "TEAM_FOUL_CORRECTED"
  | "PLAYER_FOUL_CORRECTED"
  | "TIMEOUT_CORRECTED"
  | "GAME_CLOCK_CORRECTED"
  | "SHOT_CLOCK_CORRECTED";

export type CorrectionEligibleEvent = {
  seqNo: number;
  eventType: string;
  occurredAt: string;
  actorDisplayName: string | null;
  summary: string;
  eligible: boolean;
  ineligibleReason: string | null;
  correctionKind: AlphaCorrectionKind;
  currentValue: Record<string, unknown>;
  proposedCompensation: Record<string, unknown>;
};

export type CorrectionEligibleEventsResponse = {
  matchId: string;
  currentSeq: number;
  events: CorrectionEligibleEvent[];
};

export type AlphaCorrectionResponse = {
  ok: true;
  matchId: string;
  seqNo: number;
  eventType: MatchEventType;
  projection: ScoreboardProjection | null;
};

export type CommandResult = {
  status: CommandResultStatus;
  commandId: string;
  matchId: string;
  currentSeq: number;
  appendedEvents: Array<{
    eventId: string;
    seqNo: number;
    eventType: MatchEventType;
  }>;
  reasonCode: string | null;
  message: string | null;
  projection?: ScoreboardProjection | null;
};

export type ScoreboardProjection = {
  matchId: string;
  homeTeamId?: string | null;
  homeTeamName?: string | null;
  awayTeamId?: string | null;
  awayTeamName?: string | null;
  homeScore: number;
  awayScore: number;
  teamFouls: {
    home: number;
    away: number;
  };
  teamFoulsByPeriod?: Record<string, { home: number; away: number }>;
  playerFouls: Array<{
    playerId: string;
    teamSide: "HOME" | "AWAY";
    playerName: string | null;
    jerseyNumber: string | null;
    fouls: number;
  }>;
  timeouts?: {
    home: { used: number; remaining: number };
    away: { used: number; remaining: number };
  };
  timeoutsByHalf?: {
    firstHalf: { home: number; away: number };
    secondHalf: { home: number; away: number };
    overtime: { home: number; away: number };
  };
  activeTimeout?: {
    teamSide: "HOME" | "AWAY";
    startedAt: string;
    durationMs: number;
    remainingMs: number;
    requestedBy: TimeoutRequestedBy;
  } | null;
  periodType?: "REGULATION" | "OVERTIME";
  regulationPeriods?: number;
  periodDurationMs?: number;
  overtimeDurationMs?: number;
  winnerSide?: "HOME" | "AWAY" | null;
  finalScore?: { home: number; away: number } | null;
  matchStartedAt?: string | null;
  matchFinishedAt?: string | null;
  currentPeriodStartedAt?: string | null;
  currentPeriodEndedAt?: string | null;
  period?: number;
  periodNumber: number;
  gameClockRemainingMs: number;
  shotClockRemainingMs: number | null;
  gameClock?: {
    remainingMs: number;
    running: boolean;
    lastStartedAt: string | null;
  };
  shotClock?: {
    remainingMs: number;
    running: boolean;
    lastStartedAt: string | null;
  };
  clockUpdatedAt?: string | null;
  serverTime?: string;
  status: "SCHEDULED" | "READY" | "LIVE" | "PERIOD_BREAK" | "OVERTIME" | "FINISHED" | "FINAL" | string;
  currentSeq: number;
  lastEventSeq?: number;
  updatedAt?: string | null;
  projectionVersion: "scoreboard-v1";
  displayTheme?: PublicDisplayTheme | null;
};

export type PublicScoreboardProjection = {
  matchId: string;
  homeTeamName?: string | null;
  awayTeamName?: string | null;
  homeScore: number;
  awayScore: number;
  teamFouls: {
    home: number;
    away: number;
  };
  timeouts?: {
    home: { used: number; remaining: number };
    away: { used: number; remaining: number };
  };
  activeTimeout?: {
    teamSide: "HOME" | "AWAY";
    remainingMs: number;
  } | null;
  periodType?: "REGULATION" | "OVERTIME";
  periodNumber: number;
  gameClockRemainingMs: number;
  shotClockRemainingMs: number | null;
  gameClock?: {
    remainingMs: number;
    running: boolean;
    lastStartedAt: string | null;
  };
  shotClock?: {
    remainingMs: number;
    running: boolean;
    lastStartedAt: string | null;
  };
  serverTime?: string;
  status: ScoreboardProjection["status"];
  finalScore?: { home: number; away: number } | null;
  displayTheme?: PublicDisplayTheme | null;
};

export type MatchSyncResponse = {
  matchId: string;
  currentSeq: number;
  lastEventSeq: number;
  projection: ScoreboardProjection | null;
  missedEvents: unknown[];
  fullStateSyncRequired: boolean;
  serverTime: string;
  projectionVersion: "scoreboard-v1";
  connectionStatus: "ONLINE" | "OFFLINE" | string;
};

export type MatchSnapshotPayload = {
  matchId: string;
  lastEventSeq: number;
  publicScoreboard: PublicScoreboardProjection;
  serverTime: string;
};

export type PublicMatchSnapshotPayload = {
  matchId: string;
  publicScoreboard: PublicScoreboardProjection;
  serverTime: string;
};

export type ProjectionUpdatedPayload = {
  matchId: string;
  lastEventSeq: number;
  updatedAt: string;
  publicScoreboard: PublicScoreboardProjection;
};

export type PublicProjectionUpdatedPayload = {
  matchId: string;
  updatedAt: string;
  publicScoreboard: PublicScoreboardProjection;
};

export type RealtimeErrorPayload = {
  reasonCode: string;
  message: string;
  matchId?: string;
  serverTime: string;
};
