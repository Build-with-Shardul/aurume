"use server";

import { eq } from "drizzle-orm";
import { getInstanceRole } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { user, organization, connector } from "@/lib/db/schema";
import { rewrapSecret } from "@/lib/crypto";

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

/**
 * Re-wrap every connector secret under the current primary encryption key. Run this
 * after rotating AURUME_ENCRYPTION_KEY (keep the old value in AURUME_ENCRYPTION_KEY_RETIRED
 * until this finishes). Only re-wraps the small data keys / upgrades legacy payloads;
 * the data ciphertext is untouched. Idempotent — secrets already current are skipped.
 */
export async function rewrapConnectorSecrets() {
  await requireInstanceAdmin();
  const rows = await db.select({ id: connector.id, secret: connector.secret }).from(connector);
  let rewrapped = 0;
  let failed = 0;
  for (const row of rows) {
    if (!row.secret) continue;
    try {
      const next = rewrapSecret(row.secret);
      if (next && next !== row.secret) {
        await db.update(connector).set({ secret: next }).where(eq(connector.id, row.id));
        rewrapped++;
      }
    } catch {
      failed++;
    }
  }
  if (failed > 0) {
    return { error: `Re-wrapped ${rewrapped}, but ${failed} could not be re-wrapped (missing key — set AURUME_ENCRYPTION_KEY_RETIRED?).` };
  }
  return { ok: true, rewrapped, total: rows.length };
}
