import type { AuthenticatedUser } from "../auth/sessionAuth.js";

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthenticatedUser;
  }
}
