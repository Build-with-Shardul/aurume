"use server";

import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";

/**
 * Grant the founder the instance Super Admin role (user.role = "admin"), but only while no
 * instance admin exists yet — so it self-closes after first setup and can't be abused later.
 */
export async function bootstrapInstanceAdmin() {
  const session = await getSession();
  if (!session) return;
  const existing = await db.select({ id: user.id }).from(user).where(eq(user.role, "admin")).limit(1);
  if (existing.length > 0) return;
  await db.update(user).set({ role: "admin" }).where(eq(user.id, session.user.id));
}
