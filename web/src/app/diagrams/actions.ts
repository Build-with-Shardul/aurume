"use server";

import { eq, and, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { diagram } from "@/lib/db/schema";
import { getSession, getActiveMembership } from "@/lib/auth-server";
import { getReadableDiagram, canEditDiagram } from "@/lib/diagrams";

async function ctx() {
  const session = await getSession();
  const m = await getActiveMembership();
  if (!session?.user?.id || !m?.orgId) return null;
  return { userId: session.user.id, orgId: m.orgId };
}

async function editable(orgId: string, userId: string, id: string) {
  const d = await getReadableDiagram(orgId, userId, id);
  if (!d || !canEditDiagram(d, userId)) return null;
  return d;
}

/** All descendants of a diagram (for cascade delete / visibility). */
async function subtreeIds(orgId: string, rootId: string): Promise<string[]> {
  const all = await db.select({ id: diagram.id, parentId: diagram.parentId }).from(diagram).where(eq(diagram.organizationId, orgId));
  const out = new Set<string>([rootId]);
  for (let changed = true; changed; ) {
    changed = false;
    for (const r of all) {
      if (r.parentId && out.has(r.parentId) && !out.has(r.id)) { out.add(r.id); changed = true; }
    }
  }
  return [...out];
}

export async function createDiagram(input: { parentId?: string | null; visibility?: "workspace" | "private" } = {}) {
  const c = await ctx();
  if (!c) return { error: "Not signed in" };
  // A child inherits its parent's visibility so it nests in the same section.
  let visibility: "workspace" | "private" = input.visibility === "private" ? "private" : "workspace";
  if (input.parentId) {
    const parent = await getReadableDiagram(c.orgId, c.userId, input.parentId);
    if (parent) visibility = parent.visibility === "private" ? "private" : "workspace";
  }
  const id = crypto.randomUUID();
  await db.insert(diagram).values({
    id,
    organizationId: c.orgId,
    parentId: input.parentId ?? null,
    title: "Untitled diagram",
    visibility,
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
  if (!(await editable(c.orgId, c.userId, id))) return { error: "Not allowed" };
  await db.update(diagram).set({ xml, preview: preview ?? null, lastEditedBy: c.userId, updatedAt: new Date() }).where(eq(diagram.id, id));
  revalidatePath("/diagrams");
  revalidatePath(`/diagrams/${id}`);
  return { ok: true };
}

export async function renameDiagram(id: string, title: string) {
  const c = await ctx();
  if (!c) return { error: "Not signed in" };
  if (!(await editable(c.orgId, c.userId, id))) return { error: "Not allowed" };
  await db.update(diagram).set({ title: title.trim() || "Untitled diagram", lastEditedBy: c.userId, updatedAt: new Date() }).where(eq(diagram.id, id));
  revalidatePath("/diagrams");
  revalidatePath(`/diagrams/${id}`);
  return { ok: true };
}

/** Move under a new parent (or to root) and set visibility, cascading visibility to the
 * whole subtree so a diagram's location and access stay consistent. Cycle-safe. */
export async function moveDiagram(id: string, parentId: string | null, visibility: "workspace" | "private") {
  const c = await ctx();
  if (!c) return { error: "Not signed in" };
  if (!(await editable(c.orgId, c.userId, id))) return { error: "Not allowed" };
  const subtree = await subtreeIds(c.orgId, id);
  if (parentId && subtree.includes(parentId)) return { error: "Cannot move into itself" };
  await db.update(diagram).set({ parentId: parentId ?? null, visibility, lastEditedBy: c.userId, updatedAt: new Date() }).where(eq(diagram.id, id));
  await db.update(diagram).set({ visibility }).where(inArray(diagram.id, subtree));
  revalidatePath("/diagrams");
  return { ok: true };
}

export async function setDiagramVisibility(id: string, visibility: "workspace" | "private") {
  const c = await ctx();
  if (!c) return { error: "Not signed in" };
  if (!(await editable(c.orgId, c.userId, id))) return { error: "Not allowed" };
  const subtree = await subtreeIds(c.orgId, id);
  await db.update(diagram).set({ visibility, lastEditedBy: c.userId, updatedAt: new Date() }).where(inArray(diagram.id, subtree));
  revalidatePath("/diagrams");
  revalidatePath(`/diagrams/${id}`);
  return { ok: true };
}

export async function archiveDiagram(id: string, archived: boolean) {
  const c = await ctx();
  if (!c) return { error: "Not signed in" };
  if (!(await editable(c.orgId, c.userId, id))) return { error: "Not allowed" };
  const subtree = await subtreeIds(c.orgId, id);
  await db.update(diagram).set({ archived, lastEditedBy: c.userId, updatedAt: new Date() }).where(inArray(diagram.id, subtree));
  revalidatePath("/diagrams");
  revalidatePath(`/diagrams/${id}`);
  return { ok: true };
}

/** Delete a diagram and its whole subtree. */
export async function deleteDiagram(id: string) {
  const c = await ctx();
  if (!c) return { error: "Not signed in" };
  if (!(await editable(c.orgId, c.userId, id))) return { error: "Not allowed" };
  const subtree = await subtreeIds(c.orgId, id);
  await db.delete(diagram).where(inArray(diagram.id, subtree));
  revalidatePath("/diagrams");
  return { ok: true };
}
