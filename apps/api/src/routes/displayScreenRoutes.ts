import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Pool } from "mysql2/promise";
import {
  activeDisplaySceneSchema,
  createDisplaySceneSchema,
  createDisplayScreenSchema,
  reasonCodes,
  updateDisplaySceneSchema,
  updateDisplayScreenSchema,
  type ReasonCode
} from "@basket-scoreboard/api-contracts";
import type { AuthenticatedUser } from "../auth/sessionAuth.js";
import { apiError } from "../errors/apiErrors.js";
import {
  assignActiveScene,
  createScene,
  createScreen,
  getPublicDisplay,
  getScreen,
  listScenes,
  listScreens,
  updateScene,
  updateScreen
} from "../displayScreens/displayScreenService.js";

export function registerDisplayScreenRoutes(
  app: FastifyInstance,
  pool: Pool,
  auth: {
    requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
    requireCsrf: (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
  }
) {
  function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user as AuthenticatedUser;
    if (user.role !== "ADMIN") {
      void reply.status(403).send(apiError(reasonCodes.FORBIDDEN, "Admin role is required"));
      return false;
    }
    return true;
  }

  app.get(
    "/api/v1/display-screens",
    {
      preHandler: [auth.requireAuth]
    },
    async (request, reply) => {
      if (!requireAdmin(request, reply)) {
        return;
      }

      return {
        ok: true,
        data: {
          screens: await listScreens(pool)
        }
      };
    }
  );

  app.post(
    "/api/v1/display-screens",
    {
      preHandler: [auth.requireAuth, auth.requireCsrf]
    },
    async (request, reply) => {
      if (!requireAdmin(request, reply)) {
        return;
      }

      const input = createDisplayScreenSchema.parse(request.body);
      const result = await createScreen(pool, input, request.user!.userId);
      if (!result.ok) {
        return reply.status(result.statusCode).send(apiError(result.reasonCode, result.message));
      }

      return reply.status(201).send({
        ok: true,
        data: { screen: result.value }
      });
    }
  );

  app.get<{ Params: { screenId: string } }>(
    "/api/v1/display-screens/:screenId",
    {
      preHandler: [auth.requireAuth]
    },
    async (request, reply) => {
      if (!requireAdmin(request, reply)) {
        return;
      }

      const result = await getScreen(pool, request.params.screenId);
      if (!result.ok) {
        return reply.status(result.statusCode).send(apiError(result.reasonCode, result.message));
      }

      return {
        ok: true,
        data: { screen: result.value }
      };
    }
  );

  app.patch<{ Params: { screenId: string } }>(
    "/api/v1/display-screens/:screenId",
    {
      preHandler: [auth.requireAuth, auth.requireCsrf]
    },
    async (request, reply) => {
      if (!requireAdmin(request, reply)) {
        return;
      }

      const input = updateDisplayScreenSchema.parse(request.body);
      const result = await updateScreen(pool, request.params.screenId, input, request.user!.userId);
      if (!result.ok) {
        return reply.status(result.statusCode).send(apiError(result.reasonCode, result.message));
      }

      return {
        ok: true,
        data: { screen: result.value }
      };
    }
  );

  app.get<{ Params: { screenId: string } }>(
    "/api/v1/display-screens/:screenId/scenes",
    {
      preHandler: [auth.requireAuth]
    },
    async (request, reply) => {
      if (!requireAdmin(request, reply)) {
        return;
      }

      const result = await listScenes(pool, request.params.screenId);
      if (!result.ok) {
        return reply.status(result.statusCode).send(apiError(result.reasonCode, result.message));
      }

      return {
        ok: true,
        data: { scenes: result.value }
      };
    }
  );

  app.post<{ Params: { screenId: string } }>(
    "/api/v1/display-screens/:screenId/scenes",
    {
      preHandler: [auth.requireAuth, auth.requireCsrf]
    },
    async (request, reply) => {
      if (!requireAdmin(request, reply)) {
        return;
      }

      const input = createDisplaySceneSchema.parse(request.body);
      const result = await createScene(pool, request.params.screenId, input, request.user!.userId);
      if (!result.ok) {
        return reply.status(result.statusCode).send(apiError(result.reasonCode, result.message));
      }

      return reply.status(201).send({
        ok: true,
        data: { scene: result.value }
      });
    }
  );

  app.patch<{ Params: { screenId: string; sceneId: string } }>(
    "/api/v1/display-screens/:screenId/scenes/:sceneId",
    {
      preHandler: [auth.requireAuth, auth.requireCsrf]
    },
    async (request, reply) => {
      if (!requireAdmin(request, reply)) {
        return;
      }

      const input = updateDisplaySceneSchema.parse(request.body);
      const result = await updateScene(pool, request.params.screenId, request.params.sceneId, input, request.user!.userId);
      if (!result.ok) {
        return reply.status(result.statusCode).send(apiError(result.reasonCode, result.message));
      }

      return {
        ok: true,
        data: { scene: result.value }
      };
    }
  );

  app.post<{ Params: { screenId: string } }>(
    "/api/v1/display-screens/:screenId/active-scene",
    {
      preHandler: [auth.requireAuth, auth.requireCsrf]
    },
    async (request, reply) => {
      if (!requireAdmin(request, reply)) {
        return;
      }

      const input = activeDisplaySceneSchema.parse(request.body);
      const result = await assignActiveScene(pool, request.params.screenId, input, request.user!.userId);
      if (!result.ok) {
        return reply.status(result.statusCode).send(apiError(result.reasonCode as ReasonCode, result.message));
      }

      return {
        ok: true,
        data: { activeScene: result.value }
      };
    }
  );

  app.get<{ Params: { screenSlug: string } }>(
    "/api/v1/public/display/:screenSlug",
    async (request, reply) => {
      const result = await getPublicDisplay(pool, request.params.screenSlug);
      if (!result.ok) {
        return reply.status(result.statusCode).send(apiError(result.reasonCode, result.message));
      }

      return {
        ok: true,
        data: result.value
      };
    }
  );
}
