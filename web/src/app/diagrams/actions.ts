"use server";

import { eq, and, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { diagram, diagramComment, diagramReaction, diagramShare, diagramView, projectDiagram, projectMember } from "@/lib/db/schema";
import { getSession, getActiveMembership } from "@/lib/auth-server";
import { getReadableDiagram, canEditDiagram } from "@/lib/diagrams";

/** A comment body (HTML) counts as non-empty if it has visible text, an image, or a video. */
function hasCommentContent(body: string) {
  const stripped = body.replace(/<[^>]*>/g, "").replace(/&nbsp;/gi, " ").trim();
  return stripped.length > 0 || /<img\b/i.test(body) || /data-wiki-embed/i.test(body);
}

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

// --- details: comments, reactions, views, sharing, project mapping ---

export async function recordDiagramView(id: string) {
  const c = await ctx();
  if (!c) return;
  const d = await getReadableDiagram(c.orgId, c.userId, id);
  if (!d) return;
  await db.insert(diagramView).values({ id: crypto.randomUUID(), diagramId: id, userId: c.userId });
}

export async function addDiagramComment(id: string, parentId: string | null, body: string) {
  const c = await ctx();
  if (!c) return { error: "Not signed in" };
  const text = (body || "").trim();
  if (!hasCommentContent(text)) return { error: "Empty comment" };
  const d = await getReadableDiagram(c.orgId, c.userId, id);
  if (!d) return { error: "Not found" };
  await db.insert(diagramComment).values({ id: crypto.randomUUID(), diagramId: id, parentId: parentId ?? null, authorId: c.userId, body: text });
  revalidatePath(`/diagrams/${id}`);
  return { ok: true };
}

export async function deleteDiagramComment(commentId: string) {
  const c = await ctx();
  if (!c) return { error: "Not signed in" };
  const rows = await db.select().from(diagramComment).where(eq(diagramComment.id, commentId)).limit(1);
  const cm = rows[0];
  if (!cm) return { error: "Not found" };
  const d = await getReadableDiagram(c.orgId, c.userId, cm.diagramId);
  if (!d || cm.authorId !== c.userId) return { error: "Not allowed" };
  const all = await db.select({ id: diagramComment.id, parentId: diagramComment.parentId }).from(diagramComment).where(eq(diagramComment.diagramId, cm.diagramId));
  const toDelete = new Set<string>([commentId]);
  for (let changed = true; changed; ) {
    changed = false;
    for (const r of all) if (r.parentId && toDelete.has(r.parentId) && !toDelete.has(r.id)) { toDelete.add(r.id); changed = true; }
  }
  await db.delete(diagramComment).where(inArray(diagramComment.id, [...toDelete]));
  revalidatePath(`/diagrams/${cm.diagramId}`);
  return { ok: true };
}

export async function toggleDiagramReaction(id: string, emoji: string) {
  const c = await ctx();
  if (!c) return { error: "Not signed in" };
  const d = await getReadableDiagram(c.orgId, c.userId, id);
  if (!d) return { error: "Not found" };
  const existing = await db.select({ id: diagramReaction.id }).from(diagramReaction).where(and(eq(diagramReaction.diagramId, id), eq(diagramReaction.userId, c.userId), eq(diagramReaction.emoji, emoji))).limit(1);
  if (existing[0]) await db.delete(diagramReaction).where(eq(diagramReaction.id, existing[0].id));
  else await db.insert(diagramReaction).values({ id: crypto.randomUUID(), diagramId: id, userId: c.userId, emoji });
  revalidatePath(`/diagrams/${id}`);
  return { ok: true };
}

export async function shareDiagramWithUser(id: string, targetUserId: string) {
  const c = await ctx();
  if (!c) return { error: "Not signed in" };
  const d = await getReadableDiagram(c.orgId, c.userId, id);
  if (!d || !canEditDiagram(d, c.userId)) return { error: "Not allowed" };
  const isMember = await db.select({ id: projectMember.id }).from(projectMember).where(eq(projectMember.userId, targetUserId)).limit(1);
  void isMember; // membership is workspace-scoped; the picker already restricts candidates
  const existing = await db.select({ id: diagramShare.id }).from(diagramShare).where(and(eq(diagramShare.diagramId, id), eq(diagramShare.userId, targetUserId))).limit(1);
  if (!existing[0]) await db.insert(diagramShare).values({ id: crypto.randomUUID(), diagramId: id, userId: targetUserId, addedBy: c.userId });
  revalidatePath(`/diagrams/${id}`);
  return { ok: true };
}

export async function unshareDiagramUser(id: string, targetUserId: string) {
  const c = await ctx();
  if (!c) return { error: "Not signed in" };
  const d = await getReadableDiagram(c.orgId, c.userId, id);
  if (!d || !canEditDiagram(d, c.userId)) return { error: "Not allowed" };
  await db.delete(diagramShare).where(and(eq(diagramShare.diagramId, id), eq(diagramShare.userId, targetUserId)));
  revalidatePath(`/diagrams/${id}`);
  return { ok: true };
}

export async function mapDiagramToProject(id: string, projectId: string) {
  const c = await ctx();
  if (!c) return { error: "Not signed in" };
  const d = await getReadableDiagram(c.orgId, c.userId, id);
  if (!d || !canEditDiagram(d, c.userId)) return { error: "Not allowed" };
  const member = await db.select({ id: projectMember.id }).from(projectMember).where(and(eq(projectMember.projectId, projectId), eq(projectMember.userId, c.userId))).limit(1);
  if (!member[0]) return { error: "Not a project member" };
  const existing = await db.select({ id: projectDiagram.id }).from(projectDiagram).where(and(eq(projectDiagram.projectId, projectId), eq(projectDiagram.diagramId, id))).limit(1);
  if (!existing[0]) await db.insert(projectDiagram).values({ id: crypto.randomUUID(), projectId, diagramId: id, addedBy: c.userId });
  revalidatePath(`/diagrams/${id}`);
  return { ok: true };
}

export async function unmapDiagramFromProject(id: string, projectId: string) {
  const c = await ctx();
  if (!c) return { error: "Not signed in" };
  const d = await getReadableDiagram(c.orgId, c.userId, id);
  if (!d || !canEditDiagram(d, c.userId)) return { error: "Not allowed" };
  await db.delete(projectDiagram).where(and(eq(projectDiagram.projectId, projectId), eq(projectDiagram.diagramId, id)));
  revalidatePath(`/diagrams/${id}`);
  return { ok: true };
}
