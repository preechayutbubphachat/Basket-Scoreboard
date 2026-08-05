import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";
import { reasonCodes, type ApiErrorResponse, type ReasonCode } from "@basket-scoreboard/api-contracts";

type MysqlLikeError = Error & {
  code?: string;
  errno?: number;
};

export function apiError(
  reasonCode: ReasonCode,
  message: string,
  details?: unknown
): ApiErrorResponse {
  return details === undefined
    ? { error: { reasonCode, message } }
    : { error: { reasonCode, message, details } };
}

export function isDbConstraintError(error: unknown) {
  const candidate = error as MysqlLikeError;

  return candidate?.code === "ER_DUP_ENTRY" || candidate?.errno === 1062;
}

export function toSafeErrorResponse(error: unknown): { statusCode: number; body: ApiErrorResponse } {
  if (error instanceof ZodError) {
    return {
      statusCode: 400,
      body: apiError(reasonCodes.VALIDATION_ERROR, "Request validation failed", error.issues)
    };
  }

  if (isDbConstraintError(error)) {
    return {
      statusCode: 409,
      body: apiError(reasonCodes.DB_CONSTRAINT_ERROR, "Database constraint rejected the request")
    };
  }

  return {
    statusCode: 500,
    body: apiError(reasonCodes.INTERNAL_ERROR, "Internal server error")
  };
}

export async function fastifyErrorHandler(
  error: FastifyError,
  _request: FastifyRequest,
  reply: FastifyReply
) {
  const safeError = toSafeErrorResponse(error);

  await reply.status(safeError.statusCode).send(safeError.body);
}
