import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fastifyStatic from "@fastify/static";

const assetContentTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp"
};

const browserRoutePrefixes = ["/admin", "/login", "/operator", "/public/display", "/public/scoreboard"];

export function registerSpaFallback(
  app: FastifyInstance,
  options: { frontendDistDir?: string } = {}
) {
  const frontendDistDir = options.frontendDistDir ?? findFrontendDistDir();
  const indexPath = frontendDistDir ? join(frontendDistDir, "index.html") : null;
  const canServeSpa = Boolean(indexPath && existsSync(indexPath));

  if (process.env.NODE_ENV === "production" && !canServeSpa) {
    throw new Error(
      `Frontend build output not found. Expected index.html at ${indexPath ?? "apps/web/dist/index.html"}. Run "npm install" and "npm run build" from the project root before starting the app.`
    );
  }

  if (frontendDistDir && existsSync(join(frontendDistDir, "assets"))) {
    app.register(fastifyStatic, {
      root: join(frontendDistDir, "assets"),
      prefix: "/assets/",
      decorateReply: false
    });
  }

  app.setNotFoundHandler(async (request, reply) => {
    const path = getUrlPath(request);

    if (path.startsWith("/api/")) {
      return sendApiNotFound(request, reply);
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return reply.status(404).send({ message: `Route ${request.method}:${path} not found`, error: "Not Found", statusCode: 404 });
    }

    if (frontendDistDir && path.startsWith("/assets/")) {
      return sendAsset(frontendDistDir, path, reply);
    }

    if (!canServeSpa || hasFileExtension(path) || !acceptsHtml(request) || !isBrowserRoute(path)) {
      return reply.status(404).send({ message: `Route ${request.method}:${path} not found`, error: "Not Found", statusCode: 404 });
    }

    return reply.type("text/html; charset=utf-8").send(readFileSync(indexPath!, "utf8"));
  });
}

function findFrontendDistDir() {
  const configuredDistDir = process.env.WEB_DIST_DIR?.trim();
  if (configuredDistDir) {
    return resolve(process.cwd(), configuredDistDir);
  }

  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const starts = [process.cwd(), moduleDir];

  for (const start of starts) {
    let current = resolve(start);

    for (;;) {
      const candidate = join(current, "apps", "web", "dist");
      if (existsSync(join(candidate, "index.html"))) {
        return candidate;
      }

      const parent = dirname(current);
      if (parent === current) {
        break;
      }
      current = parent;
    }
  }

  return null;
}

function getUrlPath(request: FastifyRequest) {
  return new URL(request.url, "http://localhost").pathname;
}

function acceptsHtml(request: FastifyRequest) {
  const accept = request.headers.accept;
  if (!accept) {
    return true;
  }
  const value = Array.isArray(accept) ? accept.join(",") : accept;
  return value.includes("text/html") || value.includes("*/*");
}

function hasFileExtension(path: string) {
  return extname(path) !== "";
}

function isBrowserRoute(path: string) {
  return path === "/" || browserRoutePrefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

function sendAsset(frontendDistDir: string, path: string, reply: FastifyReply) {
  const assetsDir = resolve(frontendDistDir, "assets");
  const assetPath = resolve(frontendDistDir, `.${path}`);
  const relativeAssetPath = relative(assetsDir, assetPath);

  if (
    relativeAssetPath.startsWith("..") ||
    relativeAssetPath === "" ||
    relativeAssetPath.includes(`..${sep}`) ||
    !existsSync(assetPath) ||
    !statSync(assetPath).isFile()
  ) {
    return reply.status(404).send({ message: `Route GET:${path} not found`, error: "Not Found", statusCode: 404 });
  }

  const contentType = assetContentTypes[extname(assetPath).toLowerCase()] ?? "application/octet-stream";
  return reply.type(contentType).send(readFileSync(assetPath));
}

function sendApiNotFound(request: FastifyRequest, reply: FastifyReply) {
  const path = getUrlPath(request);
  return reply.status(404).type("application/json; charset=utf-8").send({
    message: `Route ${request.method}:${path} not found`,
    error: "Not Found",
    statusCode: 404
  });
}
