#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const SERIALIZATION_VERSION = "TASK004-CANDIDATE-CHUNK-v1";
export const HASH_ALGORITHM = "SHA-256";
export const TEXT_ENCODING_POLICY = "UTF-8 raw bytes";
export const SEPARATOR_DESCRIPTION = `${SERIALIZATION_VERSION}\\0 + JSON metadata + \\0 + raw diff bytes + \\0`;

function fail(message) {
  throw new Error(message);
}

function gitBuffer(repo, args, allowedExitCodes = [0]) {
  const result = spawnSync("git", args, { cwd: repo, encoding: null, stdio: ["ignore", "pipe", "pipe"] });
  if (result.error) throw result.error;
  if (!allowedExitCodes.includes(result.status ?? -1)) {
    const detail = result.stderr?.toString("utf8").trim();
    throw new Error(`git ${args.join(" ")} failed with exit ${result.status}: ${detail}`);
  }
  return result.stdout ?? Buffer.alloc(0);
}

function gitText(repo, args, allowedExitCodes = [0]) {
  return gitBuffer(repo, args, allowedExitCodes).toString("utf8").trim();
}

export function normalizeCandidatePath(path) {
  const normalized = String(path).replaceAll("\\", "/").replace(/^\.\//, "");
  if (!normalized || normalized.startsWith("/") || normalized.split("/").includes("..")) {
    fail(`Invalid repository-relative candidate path: ${path}`);
  }
  return normalized;
}

function sortPaths(paths) {
  return [...new Set(paths.map(normalizeCandidatePath))].sort((left, right) => Buffer.from(left, "utf8").compare(Buffer.from(right, "utf8")));
}

function existsAtBase(repo, base, path) {
  const result = spawnSync("git", ["cat-file", "-e", `${base}:${path}`], { cwd: repo, encoding: null, stdio: "ignore" });
  return result.status === 0;
}

function encodeChunk(kind, path, bytes) {
  const metadata = Buffer.from(JSON.stringify({ version: SERIALIZATION_VERSION, kind, path, byteLength: bytes.length }) + "\0", "utf8");
  return Buffer.concat([Buffer.from(`${SERIALIZATION_VERSION}\0`, "utf8"), metadata, bytes, Buffer.from("\0", "utf8")]);
}

export function canonicalSerialize(chunks) {
  const normalized = chunks.map((chunk) => ({
    kind: chunk.kind,
    path: normalizeCandidatePath(chunk.path),
    bytes: Buffer.from(chunk.bytes)
  }));
  return Buffer.concat(normalized.map((chunk) => encodeChunk(chunk.kind, chunk.path, chunk.bytes)));
}

export function canonicalHash(chunks) {
  return createHash("sha256").update(canonicalSerialize(chunks)).digest("hex");
}

export function collectCandidate(repo, base, candidatePaths) {
  const paths = sortPaths(candidatePaths);
  const trackedPaths = paths.filter((path) => existsAtBase(repo, base, path));
  const untrackedPaths = paths.filter((path) => !existsAtBase(repo, base, path));
  const chunks = [];

  for (const path of trackedPaths) {
    const bytes = gitBuffer(repo, ["diff", "--binary", base, "--", path]);
    chunks.push({ kind: "tracked", path, bytes });
  }
  for (const path of untrackedPaths) {
    const bytes = gitBuffer(repo, ["diff", "--binary", "--no-index", "/dev/null", path], [0, 1]);
    chunks.push({ kind: "untracked", path, bytes });
  }

  return {
    chunks,
    trackedPaths,
    untrackedPaths,
    sha256: canonicalHash(chunks),
    byteLength: canonicalSerialize(chunks).length,
    hashAlgorithm: HASH_ALGORITHM,
    encoding: TEXT_ENCODING_POLICY,
    separator: SEPARATOR_DESCRIPTION,
    trackedCommand: "git diff --binary <reviewed_head> -- <sorted tracked path>",
    untrackedCommand: "git diff --binary --no-index /dev/null <sorted untracked path>",
    pathNormalization: "repository-relative POSIX separators; reject absolute and parent traversal paths",
    sortOrder: "UTF-8 byte lexicographic; tracked group before untracked group",
    lineEndingPolicy: "raw subprocess bytes; no text conversion"
  };
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) continue;
    const key = value.slice(2);
    args[key] = argv[index + 1]?.startsWith("--") ? true : argv[++index];
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.repo || !args.base || !args["paths-file"]) fail("--repo, --base and --paths-file are required");
  const paths = readFileSync(args["paths-file"], "utf8").split(/\r?\n/).filter(Boolean);
  const result = collectCandidate(args.repo, args.base, paths);
  const mode = args.mode ?? "generate";
  if (mode === "verify") {
    result.expectedSha256 = String(args.expected ?? "");
    result.identityMatch = result.sha256 === result.expectedSha256;
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (mode === "verify" && !result.identityMatch) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
