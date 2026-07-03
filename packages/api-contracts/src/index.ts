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
  USER_NOT_FOUND: "USER_NOT_FOUND",
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
  roleCode: MatchOfficialRoleCode;
  assignmentStatus: "ACTIVE" | "REVOKED" | string;
  assignedAt: string;
  revokedAt: string | null;
};

export type OperatorMatchSummary = {
  matchId: string;
  matchCode: string | null;
  homeTeamId: string | null;
  homeTeamName: string | null;
  awayTeamId: string | null;
  awayTeamName: string | null;
  status: string;
  scheduledAt: string | null;
  venueName: string | null;
  assignedRoleCodes: MatchOfficialRoleCode[];
  currentSeq: number;
  homeScore: number | null;
  awayScore: number | null;
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
  | "match.correction.request"
  | "match.correction.apply"
  | "match.correction.reject"
  | "match.audit.read"
  | "public.scoreboard.read";

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
  ruleProfileId: z.string().min(1).max(80).default("FIBA_2024")
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
  | "CORRECTION_REJECTED";

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
  publicScoreboard: ScoreboardProjection;
  serverTime: string;
};

export type ProjectionUpdatedPayload = {
  matchId: string;
  lastEventSeq: number;
  updatedAt: string;
  publicScoreboard: ScoreboardProjection;
};

export type RealtimeErrorPayload = {
  reasonCode: string;
  message: string;
  matchId?: string;
  serverTime: string;
};
