import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { auth } from "./auth";
import { db } from "./db";
import { user, member } from "./db/schema";

/** Current session (or null) on the server. */
export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

/** True once the instance has been set up (at least one user exists). */
export async function hasUsers() {
  const rows = await db.select({ id: user.id }).from(user).limit(1);
  return rows.length > 0;
}

/** The current user's active org membership (active org, else their first). */
export async function getActiveMembership() {
  const session = await getSession();
  if (!session) return null;
  const rows = await db
    .select({ orgId: member.organizationId, role: member.role })
    .from(member)
    .where(eq(member.userId, session.user.id));
  const active = session.session.activeOrganizationId;
  const chosen = (active && rows.find((r) => r.orgId === active)) || rows[0];
  return {
    userId: session.user.id,
    orgId: (chosen?.orgId ?? null) as string | null,
    role: (chosen?.role ?? null) as string | null,
  };
}

/** owner/admin can manage the org (invite, connectors, settings). */
export function canManageOrg(role: string | null) {
  return role === "owner" || role === "admin";
}

/** The current user's INSTANCE role (user.role: "admin" = platform Super Admin). */
export async function getInstanceRole() {
  const session = await getSession();
  if (!session) return null;
  const rows = await db.select({ role: user.role }).from(user).where(eq(user.id, session.user.id)).limit(1);
  return { session, role: (rows[0]?.role ?? "user") as string };
}

export async function isInstanceAdmin() {
  const r = await getInstanceRole();
  return r?.role === "admin";
}
