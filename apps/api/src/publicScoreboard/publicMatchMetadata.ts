import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import type { PublicMatchMetadata } from "@basket-scoreboard/api-contracts";

const publicLabelMaxLength = 200;
const controlCharacterPattern = /[\u0000-\u001f\u007f]/;

type PublicMatchMetadataRow = RowDataPacket & {
  match_code: unknown;
  scheduled_at: unknown;
  venue_name: unknown;
  metadata: unknown;
};

export async function resolvePublicMatchMetadata(
  database: Pick<Pool, "getConnection"> | Pick<PoolConnection, "query">,
  matchId: string
): Promise<PublicMatchMetadata | undefined> {
  const ownsConnection = "getConnection" in database && typeof database.getConnection === "function";
  const connection: Pick<PoolConnection, "query" | "release"> = ownsConnection
    ? await database.getConnection()
    : database as Pick<PoolConnection, "query" | "release">;
  let rows: PublicMatchMetadataRow[];

  try {
    [rows] = await connection.query<PublicMatchMetadataRow[]>(
      `SELECT
         match_code,
         DATE_FORMAT(scheduled_at, '%Y-%m-%d %H:%i:%s') AS scheduled_at,
         venue_name,
         metadata
       FROM matches
       WHERE match_id = ?
       LIMIT 1`,
      [matchId]
    );
  } finally {
    if (ownsConnection) {
      connection.release();
    }
  }
  const row = rows[0];

  if (!row) {
    return undefined;
  }

  const metadata = parseMetadataObject(row.metadata);
  const resolved: PublicMatchMetadata = {
    ...optionalField("roundLabel", normalizePublicLabel(row.match_code)),
    ...optionalField("courtLabel", normalizePublicLabel(metadata?.courtLabel)),
    ...optionalField("venueLabel", normalizePublicLabel(row.venue_name)),
    ...optionalField("scheduledStart", normalizeScheduledStart(row.scheduled_at))
  };

  return Object.keys(resolved).length > 0 ? resolved : undefined;
}

export function normalizePublicLabel(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  if (controlCharacterPattern.test(value)) {
    return undefined;
  }

  const normalized = value.trim();
  if (!normalized || normalized.length > publicLabelMaxLength) {
    return undefined;
  }

  return normalized;
}

export function normalizeScheduledStart(value: unknown): string | undefined {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  const explicitUtc = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/i.exec(normalized);
  const databaseDateTime = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/.exec(normalized);
  const match = explicitUtc ?? databaseDateTime;
  if (!match) {
    return undefined;
  }

  const milliseconds = Number((match[7] ?? "0").padEnd(3, "0"));
  const timestamp = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6]),
    milliseconds
  );
  const date = new Date(timestamp);
  if (
    Number.isNaN(timestamp)
    || date.getUTCFullYear() !== Number(match[1])
    || date.getUTCMonth() !== Number(match[2]) - 1
    || date.getUTCDate() !== Number(match[3])
    || date.getUTCHours() !== Number(match[4])
    || date.getUTCMinutes() !== Number(match[5])
    || date.getUTCSeconds() !== Number(match[6])
  ) {
    return undefined;
  }

  return date.toISOString();
}

function parseMetadataObject(value: unknown): Record<string, unknown> | undefined {
  const parsed = typeof value === "string" ? parseJson(value) : value;
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : undefined;
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function optionalField<Key extends keyof PublicMatchMetadata>(key: Key, value: PublicMatchMetadata[Key]) {
  return value === undefined ? {} : { [key]: value } as Pick<PublicMatchMetadata, Key>;
}
