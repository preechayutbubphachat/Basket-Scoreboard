import { z } from "zod";

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.literal("basket-scoreboard-api")
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const reasonCodes = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
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

export const addScoreCommandSchema = z.object({
  commandId: z.string().uuid(),
  matchId: z.string().uuid(),
  expectedSeq: z.number().int().min(0),
  correlationId: z.string().uuid(),
  clientTimestamp: z.string().datetime(),
  payload: scoreAddedPayloadSchema
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
export type AddScoreCommand = z.infer<typeof addScoreCommandSchema>;
export type CommandResultStatus = z.infer<typeof commandResultStatusSchema>;

export type CommandResult = {
  status: CommandResultStatus;
  commandId: string;
  matchId: string;
  currentSeq: number;
  appendedEvents: Array<{
    eventId: string;
    seqNo: number;
    eventType: "SCORE_ADDED";
  }>;
  reasonCode: string | null;
  message: string | null;
};
