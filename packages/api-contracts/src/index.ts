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

export const applyScoreCorrectionCommandSchema = commandEnvelopeBaseSchema.extend({
  payload: applyScoreCorrectionPayloadSchema
});

export const rejectCorrectionCommandSchema = commandEnvelopeBaseSchema.extend({
  payload: rejectCorrectionPayloadSchema
});

export const syncQuerySchema = z.object({
  lastEventSeq: z.coerce.number().int().min(0).default(0)
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
export type AddScoreCommand = z.infer<typeof addScoreCommandSchema>;
export type AddTeamFoulCommand = z.infer<typeof addTeamFoulCommandSchema>;
export type AddPlayerFoulCommand = z.infer<typeof addPlayerFoulCommandSchema>;
export type CorrectionRequestPayload = z.infer<typeof correctionRequestPayloadSchema>;
export type ApplyScoreCorrectionPayload = z.infer<typeof applyScoreCorrectionPayloadSchema>;
export type RejectCorrectionPayload = z.infer<typeof rejectCorrectionPayloadSchema>;
export type CorrectionRequestCommand = z.infer<typeof correctionRequestCommandSchema>;
export type ApplyScoreCorrectionCommand = z.infer<typeof applyScoreCorrectionCommandSchema>;
export type RejectCorrectionCommand = z.infer<typeof rejectCorrectionCommandSchema>;
export type CommandResultStatus = z.infer<typeof commandResultStatusSchema>;

export type MatchEventType =
  | "SCORE_ADDED"
  | "TEAM_FOUL_ADDED"
  | "PLAYER_FOUL_ADDED"
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
  period?: number;
  periodNumber: number;
  gameClockRemainingMs: number;
  shotClockRemainingMs: number | null;
  status: "READY" | "LIVE" | "FINAL" | string;
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
