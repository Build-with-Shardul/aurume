"use server";

import { getActiveMembership, canManageOrg } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { discipline } from "@/lib/db/schema";

function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/(^_|_$)/g, "").slice(0, 40);
}

/** Add a custom job title (discipline) to the current workspace. */
export async function addCustomDiscipline(label: string) {
  const m = await getActiveMembership();
  if (!m?.orgId || !canManageOrg(m.role)) return { error: "You don't have permission to add titles." };
  const clean = label.trim();
  if (!clean) return { error: "Enter a title." };
  const value = slugify(clean);
  if (!value) return { error: "That title isn't valid." };
  try {
    await db.insert(discipline).values({
      id: crypto.randomUUID(),
      organizationId: m.orgId,
      value,
      label: clean,
    });
  } catch {
    // unique (org, value) conflict — the title already exists; treat as success.
  }
  return { ok: true, value };
}
