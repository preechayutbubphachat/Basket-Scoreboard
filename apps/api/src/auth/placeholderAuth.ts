import type { FastifyReply, FastifyRequest } from "fastify";
import { apiError } from "../errors/apiErrors";
import { reasonCodes } from "@basket-scoreboard/api-contracts";

export type AuthenticatedUser = {
  userId: string;
  role: "ADMIN" | "SCORER";
  deviceId: string;
};

export const placeholderUser: AuthenticatedUser = {
  userId: "00000000-0000-4000-8000-000000000001",
  role: "SCORER",
  deviceId: "placeholder-device"
};

export async function placeholderAuth(request: FastifyRequest) {
  request.user = placeholderUser;
}

export async function requireScorerOrAdmin(request: FastifyRequest, reply: FastifyReply) {
  if (!request.user || !["ADMIN", "SCORER"].includes(request.user.role)) {
    await reply.status(403).send({
      ...apiError(reasonCodes.FORBIDDEN, "Scorer or admin role required")
    });
  }
}
