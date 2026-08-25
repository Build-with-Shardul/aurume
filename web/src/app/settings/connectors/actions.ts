"use server";

import { and, eq } from "drizzle-orm";
import { getActiveMembership, canManageOrg } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { connector } from "@/lib/db/schema";
import { encryptSecret } from "@/lib/crypto";
import { getProvider } from "@/lib/connectors";

async function requireAdminOrg() {
  const m = await getActiveMembership();
  if (!m?.orgId) throw new Error("No workspace found.");
  if (!canManageOrg(m.role)) throw new Error("You don't have permission to manage connectors.");
  return m.orgId;
}

export async function saveConnector(provider: string, values: Record<string, string>) {
  const orgId = await requireAdminOrg();
  const def = getProvider(provider);
  if (!def || !def.available) return { error: "Unknown or unavailable provider." };

  const config: Record<string, string> = {};
  let secretPlain: string | null = null;
  for (const f of def.fields) {
    const v = (values[f.key] ?? "").trim();
    if (f.secret) {
      if (v) secretPlain = v;
    } else if (v) {
      config[f.key] = v;
    }
  }

  const existing = (
    await db
      .select()
      .from(connector)
      .where(and(eq(connector.organizationId, orgId), eq(connector.provider, provider)))
      .limit(1)
  )[0];

  // Keep the existing secret if the admin didn't re-enter it.
  const secret = secretPlain ? encryptSecret(secretPlain) : existing?.secret ?? null;
  if (!secret) return { error: "An API key is required to connect." };

  if (existing) {
    await db
      .update(connector)
      .set({ config, secret, status: "connected", updatedAt: new Date() })
      .where(eq(connector.id, existing.id));
  } else {
    await db.insert(connector).values({
      id: crypto.randomUUID(),
      organizationId: orgId,
      provider,
      config,
      secret,
      status: "connected",
    });
  }
  return { ok: true };
}

export async function removeConnector(provider: string) {
  const orgId = await requireAdminOrg();
  await db.delete(connector).where(and(eq(connector.organizationId, orgId), eq(connector.provider, provider)));
  return { ok: true };
}
