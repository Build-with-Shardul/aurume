"use server";

import { eq } from "drizzle-orm";
import { getInstanceRole } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { user, organization } from "@/lib/db/schema";

async function requireInstanceAdmin() {
  const r = await getInstanceRole();
  if (!r || r.role !== "admin") throw new Error("Not authorized");
  return r.session;
}

export async function setInstanceAdmin(userId: string, makeAdmin: boolean) {
  const me = await requireInstanceAdmin();
  if (userId === me.user.id && !makeAdmin) return { error: "You can't revoke your own admin access." };
  await db.update(user).set({ role: makeAdmin ? "admin" : "user" }).where(eq(user.id, userId));
  return { ok: true };
}

export async function setBanned(userId: string, banned: boolean) {
  const me = await requireInstanceAdmin();
  if (userId === me.user.id) return { error: "You can't ban yourself." };
  await db.update(user).set({ banned }).where(eq(user.id, userId));
  return { ok: true };
}

export async function deleteOrganization(orgId: string) {
  await requireInstanceAdmin();
  // Cascades to members, invitations, connectors, disciplines (FK on delete cascade).
  await db.delete(organization).where(eq(organization.id, orgId));
  return { ok: true };
}
