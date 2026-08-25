import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set — see web/.env.example");
}

// `prepare: false` keeps this compatible with poolers (Neon, pgbouncer). One shared client.
const client = postgres(connectionString, { prepare: false });

export const db = drizzle(client, { schema });
