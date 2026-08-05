import { randomUUID } from "node:crypto";
import type { Pool, RowDataPacket } from "mysql2/promise";
import {
  reasonCodes,
  type CreateCourtRequest,
  type CreateVenueRequest,
  type ReasonCode,
  type VenueCourt,
  type VenueSummary
} from "@basket-scoreboard/api-contracts";

type SetupResult<T> =
  | { ok: true; statusCode: number; value: T }
  | { ok: false; statusCode: number; reasonCode: ReasonCode; message: string };

type VenueCourtRow = RowDataPacket & {
  venue_id: string;
  venue_name: string;
  short_name: string | null;
  address: string | null;
  venue_active: number | boolean;
  court_id: string | null;
  court_label: string | null;
  display_name: string | null;
  court_active: number | boolean | null;
};

type VenueRow = RowDataPacket & {
  venue_id: string;
  name: string;
  short_name: string | null;
  address: string | null;
  active: number | boolean;
};

type CourtSnapshotRow = RowDataPacket & {
  court_id: string;
  venue_id: string;
  court_label: string;
  display_name: string | null;
  venue_name: string;
};

export type CourtSnapshot = {
  courtId: string;
  venueId: string;
  courtLabel: string;
  displayName: string | null;
  venueLabel: string;
};

export async function listVenuesWithCourts(pool: Pool): Promise<VenueSummary[]> {
  const [rows] = await pool.query<VenueCourtRow[]>(`
    SELECT
      v.venue_id,
      v.name AS venue_name,
      v.short_name,
      v.address,
      v.active AS venue_active,
      c.court_id,
      c.label AS court_label,
      c.display_name,
      c.active AS court_active
    FROM venues v
    LEFT JOIN courts c ON c.venue_id = v.venue_id
    ORDER BY v.name ASC, c.label ASC
  `);

  const venues = new Map<string, VenueSummary>();
  for (const row of rows) {
    let venue = venues.get(row.venue_id);
    if (!venue) {
      venue = {
        venueId: row.venue_id,
        name: row.venue_name,
        shortName: row.short_name,
        address: row.address,
        active: Boolean(row.venue_active),
        courts: []
      };
      venues.set(row.venue_id, venue);
    }

    if (row.court_id && row.court_label) {
      venue.courts.push({
        courtId: row.court_id,
        label: row.court_label,
        displayName: row.display_name,
        active: Boolean(row.court_active)
      });
    }
  }

  return [...venues.values()];
}

export async function createVenueSetup(pool: Pool, input: CreateVenueRequest): Promise<SetupResult<VenueSummary>> {
  const venueId = randomUUID();
  try {
    await pool.query(
      "INSERT INTO venues (venue_id, name, short_name, address, active) VALUES (?, ?, ?, ?, 1)",
      [venueId, input.name, input.shortName ?? null, input.address ?? null]
    );
  } catch (error) {
    if (isDuplicateError(error)) {
      return {
        ok: false,
        statusCode: 409,
        reasonCode: reasonCodes.DB_CONSTRAINT_ERROR,
        message: "Venue name already exists"
      };
    }
    throw error;
  }

  return {
    ok: true,
    statusCode: 201,
    value: {
      venueId,
      name: input.name,
      shortName: input.shortName ?? null,
      address: input.address ?? null,
      active: true,
      courts: []
    }
  };
}

export async function createCourtSetup(
  pool: Pool,
  venueId: string,
  input: CreateCourtRequest
): Promise<SetupResult<VenueCourt>> {
  const venue = await findVenue(pool, venueId);
  if (!venue) {
    return { ok: false, statusCode: 404, reasonCode: reasonCodes.MATCH_NOT_FOUND, message: "Venue was not found" };
  }

  const courtId = randomUUID();
  try {
    await pool.query(
      "INSERT INTO courts (court_id, venue_id, label, display_name, active) VALUES (?, ?, ?, ?, 1)",
      [courtId, venueId, input.label, input.displayName ?? null]
    );
  } catch (error) {
    if (isDuplicateError(error)) {
      return {
        ok: false,
        statusCode: 409,
        reasonCode: reasonCodes.DB_CONSTRAINT_ERROR,
        message: "Court label already exists for this venue"
      };
    }
    throw error;
  }

  return {
    ok: true,
    statusCode: 201,
    value: {
      courtId,
      label: input.label,
      displayName: input.displayName ?? null,
      active: true
    }
  };
}

export async function findActiveCourtSnapshot(pool: Pool, courtId: string): Promise<CourtSnapshot | null> {
  const [rows] = await pool.query<CourtSnapshotRow[]>(
    `SELECT
       c.court_id,
       c.venue_id,
       c.label AS court_label,
       c.display_name,
       v.name AS venue_name
     FROM courts c
     INNER JOIN venues v ON v.venue_id = c.venue_id
     WHERE c.court_id = ?
       AND c.active = 1
       AND v.active = 1
     LIMIT 1`,
    [courtId]
  );

  const row = rows[0];
  return row
    ? {
        courtId: row.court_id,
        venueId: row.venue_id,
        courtLabel: row.court_label,
        displayName: row.display_name,
        venueLabel: row.venue_name
      }
    : null;
}

async function findVenue(pool: Pool, venueId: string) {
  const [rows] = await pool.query<VenueRow[]>(
    "SELECT venue_id, name, short_name, address, active FROM venues WHERE venue_id = ? AND active = 1 LIMIT 1",
    [venueId]
  );
  return rows[0] ?? null;
}

function isDuplicateError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ER_DUP_ENTRY";
}
