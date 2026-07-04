import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Pool, RowDataPacket } from "mysql2/promise";
import { z } from "zod";
import { reasonCodes, type MatchOfficialRoleCode, type ReasonCode } from "@basket-scoreboard/api-contracts";
import { apiError } from "../errors/apiErrors.js";
import type { AuthenticatedUser } from "../auth/sessionAuth.js";
import {
  assignMatchOfficial,
  isMatchOfficialRoleCode,
  listMatchOfficials,
  revokeMatchOfficial
} from "../matchOfficials/matchOfficialService.js";

const assignOfficialSchema = z.object({
  userId: z.string().uuid(),
  roleCode: z.string().refine(isMatchOfficialRoleCode, "Invalid official role code")
});

const revokeOfficialSchema = z.object({
  reason: z.string().trim().min(1).max(500)
});

type CountRow = RowDataPacket & {
  count: number | string | null;
};

export function registerMatchOfficialRoutes(
  app: FastifyInstance,
  pool: Pool,
  auth: {
    requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
    requireCsrf: (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
  }
) {
  app.post<{ Params: { matchId: string } }>(
    "/api/v1/matches/:matchId/officials",
    {
      preHandler: [auth.requireAuth, auth.requireCsrf]
    },
    async (request, reply) => {
      const input = assignOfficialSchema.parse(request.body);
      const result = await assignMatchOfficial(
        pool,
        request.user as AuthenticatedUser,
        request.params.matchId,
        input.userId,
        input.roleCode as MatchOfficialRoleCode
      );

      if (!result.ok) {
        return reply.status(result.statusCode).send(apiError(result.reasonCode as ReasonCode, result.message));
      }

      return reply.status(result.statusCode).send({
        ok: true,
        data: {
          assignment: result.assignment
        }
      });
    }
  );

  app.get<{ Params: { matchId: string } }>(
    "/api/v1/matches/:matchId/officials",
    {
      preHandler: [auth.requireAuth]
    },
    async (request, reply) => {
      const user = request.user as AuthenticatedUser;

      if (user.role !== "ADMIN") {
        return reply.status(403).send(apiError(reasonCodes.FORBIDDEN, "Admin role is required"));
      }

      const [rows] = await pool.query<CountRow[]>(
        "SELECT COUNT(*) AS count FROM matches WHERE match_id = ?",
        [request.params.matchId]
      );
      if (Number(rows[0]?.count ?? 0) < 1) {
        return reply.status(404).send(apiError(reasonCodes.MATCH_NOT_FOUND, "Match not found"));
      }

      return {
        ok: true,
        data: {
          officials: await listMatchOfficials(pool, request.params.matchId)
        }
      };
    }
  );

  app.delete<{ Params: { matchId: string; assignmentId: string } }>(
    "/api/v1/matches/:matchId/officials/:assignmentId",
    {
      preHandler: [auth.requireAuth, auth.requireCsrf]
    },
    async (request, reply) => {
      const input = revokeOfficialSchema.parse(request.body);
      const result = await revokeMatchOfficial(
        pool,
        request.user as AuthenticatedUser,
        request.params.assignmentId,
        input.reason
      );

      if (!result.ok) {
        return reply.status(result.statusCode).send(apiError(result.reasonCode as ReasonCode, result.message));
      }

      return {
        ok: true,
        data: {
          assignment: result.assignment
        }
      };
    }
  );
}
