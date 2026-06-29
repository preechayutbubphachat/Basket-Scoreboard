import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

const allowedMethods = "GET, POST, PUT, PATCH, DELETE, OPTIONS";
const allowedHeaders = "Content-Type, Accept, x-csrf-token";

function getAllowedOrigins() {
  return (process.env.API_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function credentialsEnabled() {
  return process.env.API_CORS_CREDENTIALS === "true";
}

function applyCorsHeaders(request: FastifyRequest, reply: FastifyReply) {
  const origin = request.headers.origin;

  if (!origin || !getAllowedOrigins().includes(origin)) {
    return;
  }

  reply.header("Access-Control-Allow-Origin", origin);
  reply.header("Vary", "Origin");
  reply.header("Access-Control-Allow-Methods", allowedMethods);
  reply.header("Access-Control-Allow-Headers", allowedHeaders);

  if (credentialsEnabled()) {
    reply.header("Access-Control-Allow-Credentials", "true");
  }
}

export function registerCors(app: FastifyInstance) {
  app.addHook("onRequest", async (request, reply) => {
    applyCorsHeaders(request, reply);

    if (request.method === "OPTIONS") {
      return reply.status(204).send();
    }
  });
}
