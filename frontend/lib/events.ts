import "server-only";

import { readFileSync } from "node:fs";
import { Pool } from "pg";
import type { CultureEvent } from "@/lib/events-data";

let pool: Pool | undefined;

function getPool() {
  pool ??= new Pool({
    host: process.env.PGHOST ?? "postgres",
    port: Number(process.env.PGPORT ?? 5432),
    database: process.env.PGDATABASE ?? "kultur",
    user: process.env.PGUSER ?? "kultur",
    password: readFileSync(process.env.PGPASSWORD_FILE ?? "/run/secrets/pg_password", "utf8").trim(),
  });
  return pool;
}

export async function getUpcomingEvents(): Promise<CultureEvent[]> {
  const result = await getPool().query<{
    id: number;
    title: string;
    venue: string;
    starts_at: Date;
  }>(
    `SELECT id, title, venue, starts_at
     FROM events
     WHERE starts_at > NOW()
     ORDER BY starts_at ASC`,
  );

  return result.rows.map((event) => ({
    id: event.id,
    title: event.title,
    venue: event.venue,
    startsAt: event.starts_at.toISOString(),
  }));
}
