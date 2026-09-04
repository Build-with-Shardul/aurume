"use server";

import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { diagram } from "@/lib/db/schema";
import { getSession, getActiveMembership } from "@/lib/auth-server";

async function ctx() {
  const session = await getSession();
  const m = await getActiveMembership();
  if (!session?.user?.id || !m?.orgId) return null;
  return { userId: session.user.id, orgId: m.orgId };
}

async function owned(orgId: string, id: string) {
  const rows = await db.select({ id: diagram.id }).from(diagram).where(and(eq(diagram.id, id), eq(diagram.organizationId, orgId))).limit(1);
  return !!rows[0];
}

export async function createDiagram(title?: string) {
  const c = await ctx();
  if (!c) return { error: "Not signed in" };
  const id = crypto.randomUUID();
  await db.insert(diagram).values({
    id,
    organizationId: c.orgId,
    title: title?.trim() || "Untitled diagram",
    authorId: c.userId,
    createdBy: c.userId,
    lastEditedBy: c.userId,
  });
  revalidatePath("/diagrams");
  return { id };
}

/** Save the drawio XML (source of truth) and an exported SVG preview. */
export async function saveDiagram(id: string, xml: string, preview: string | null) {
  const c = await ctx();
  if (!c) return { error: "Not signed in" };
  if (!(await owned(c.orgId, id))) return { error: "Not found" };
  await db.update(diagram).set({ xml, preview: preview ?? null, lastEditedBy: c.userId, updatedAt: new Date() }).where(eq(diagram.id, id));
  revalidatePath("/diagrams");
  revalidatePath(`/diagrams/${id}`);
  return { ok: true };
}

export async function renameDiagram(id: string, title: string) {
  const c = await ctx();
  if (!c) return { error: "Not signed in" };
  if (!(await owned(c.orgId, id))) return { error: "Not found" };
  await db.update(diagram).set({ title: title.trim() || "Untitled diagram", lastEditedBy: c.userId, updatedAt: new Date() }).where(eq(diagram.id, id));
  revalidatePath("/diagrams");
  revalidatePath(`/diagrams/${id}`);
  return { ok: true };
}

export async function deleteDiagram(id: string) {
  const c = await ctx();
  if (!c) return { error: "Not signed in" };
  if (!(await owned(c.orgId, id))) return { error: "Not found" };
  await db.delete(diagram).where(eq(diagram.id, id));
  revalidatePath("/diagrams");
  return { ok: true };
}
