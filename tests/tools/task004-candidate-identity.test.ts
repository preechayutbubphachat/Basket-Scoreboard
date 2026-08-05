import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const tool = join(repoRoot, "tools", "task004-candidate-identity.mjs");

function git(cwd: string, ...args: string[]) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function runTool(repo: string, pathsFile: string, ...args: string[]) {
  return JSON.parse(execFileSync("node", [tool, "--repo", repo, "--base", git(repo, "rev-parse", "HEAD"), "--paths-file", pathsFile, ...args], { encoding: "utf8" }));
}

function fixture() {
  const repo = mkdtempSync(join(tmpdir(), "rm08-candidate-"));
  git(repo, "init", "--quiet");
  git(repo, "config", "user.email", "task004@example.invalid");
  git(repo, "config", "user.name", "Task 004");
  writeFileSync(join(repo, "tracked.txt"), "baseline\n", "utf8");
  git(repo, "add", "--", "tracked.txt");
  git(repo, "commit", "--quiet", "-m", "baseline");
  writeFileSync(join(repo, "tracked.txt"), "changed\n", "utf8");
  writeFileSync(join(repo, "space name.bin"), Buffer.from([0, 255, 1, 2, 3]));
  writeFileSync(join(repo, "z-untracked.txt"), "z\n", "utf8");
  const pathsFile = join(repo, "candidate-paths.txt");
  writeFileSync(pathsFile, "z-untracked.txt\nspace name.bin\ntracked.txt\n", "utf8");
  return { repo, pathsFile, cleanup: () => rmSync(repo, { recursive: true, force: true }) };
}

describe("Task 004 canonical candidate identity", () => {
  it("serializes tracked-only, untracked-only, and mixed candidates with explicit deterministic metadata", () => {
    const f = fixture();
    try {
      const mixed = runTool(f.repo, f.pathsFile, "--mode", "generate");
      const trackedPaths = join(f.repo, "tracked-only.txt");
      const untrackedPaths = join(f.repo, "untracked-only.txt");
      writeFileSync(trackedPaths, "tracked-only\n", "utf8");
      writeFileSync(untrackedPaths, "untracked-only\n", "utf8");
      const trackedFile = join(f.repo, "tracked-only-paths.txt");
      const untrackedFile = join(f.repo, "untracked-only-paths.txt");
      writeFileSync(trackedFile, "tracked.txt\n", "utf8");
      writeFileSync(untrackedFile, "untracked-only.txt\n", "utf8");
      const tracked = runTool(f.repo, trackedFile, "--mode", "generate");
      const untracked = runTool(f.repo, untrackedFile, "--mode", "generate");
      expect(tracked.trackedPaths).toEqual(["tracked.txt"]);
      expect(tracked.untrackedPaths).toEqual([]);
      expect(untracked.trackedPaths).toEqual([]);
      expect(untracked.untrackedPaths).toEqual(["untracked-only.txt"]);
      expect(mixed.trackedPaths).toEqual(["tracked.txt"]);
      expect(mixed.untrackedPaths).toEqual(["space name.bin", "z-untracked.txt"]);
      expect(mixed.separator).toContain("TASK004-CANDIDATE-CHUNK-v1");
      expect(mixed.encoding).toBe("UTF-8 raw bytes");
      expect(mixed.hashAlgorithm).toBe("SHA-256");
    } finally {
      f.cleanup();
    }
  });

  it("sorts paths independent of creation order, supports spaces/binary bytes, and repeats exactly", () => {
    const f = fixture();
    try {
      const first = runTool(f.repo, f.pathsFile, "--mode", "generate");
      const reversed = join(f.repo, "reversed-paths.txt");
      writeFileSync(reversed, "tracked.txt\nz-untracked.txt\nspace name.bin\n", "utf8");
      const second = runTool(f.repo, reversed, "--mode", "generate");
      const third = runTool(f.repo, f.pathsFile, "--mode", "generate");
      expect(second.sha256).toBe(first.sha256);
      expect(third.sha256).toBe(first.sha256);
      expect(first.byteLength).toBeGreaterThan(Buffer.byteLength("baseline\n"));
      expect(first.untrackedPaths).toEqual(["space name.bin", "z-untracked.txt"]);
    } finally {
      f.cleanup();
    }
  });

  it("uses the same executable for independent verification and rejects a wrong identity", () => {
    const f = fixture();
    try {
      const generated = runTool(f.repo, f.pathsFile, "--mode", "generate");
      const verified = runTool(f.repo, f.pathsFile, "--mode", "verify", "--expected", generated.sha256);
      expect(verified.identityMatch).toBe(true);
      expect(() => runTool(f.repo, f.pathsFile, "--mode", "verify", "--expected", "0".repeat(64))).toThrow();
    } finally {
      f.cleanup();
    }
  });
});
