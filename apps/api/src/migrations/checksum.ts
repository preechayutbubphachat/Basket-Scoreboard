import { createHash } from "node:crypto";

export function calculateSha256(content: string) {
  return createHash("sha256").update(content, "utf8").digest("hex");
}
