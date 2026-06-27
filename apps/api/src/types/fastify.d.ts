import type { AuthenticatedUser } from "../auth/placeholderAuth.js";

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthenticatedUser;
  }
}
