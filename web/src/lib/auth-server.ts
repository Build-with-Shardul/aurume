import { headers } from "next/headers";
import { auth } from "./auth";
import { db } from "./db";
import { user } from "./db/schema";

/** Current session (or null) on the server. */
export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

/** True once the instance has been set up (at least one user exists). */
export async function hasUsers() {
  const rows = await db.select({ id: user.id }).from(user).limit(1);
  return rows.length > 0;
}
