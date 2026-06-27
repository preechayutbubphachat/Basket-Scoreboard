import type { AuthenticatedUser } from "../auth/placeholderAuth";

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthenticatedUser;
  }
}
