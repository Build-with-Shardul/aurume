"use server";

import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { document, documentView } from "@/lib/db/schema";
import { getSession, getActiveMembership } from "@/lib/auth-server";
import { getReadableDocument, canEditDocument } from "@/lib/wiki";

async function ctx() {
  const session = await getSession();
  const m = await getActiveMembership();
  if (!session?.user?.id || !m?.orgId) return null;
  return { userId: session.user.id, orgId: m.orgId };
}

async function editable(orgId: string, userId: string, id: string) {
  const doc = await getReadableDocument(orgId, userId, id);
  if (!doc || !canEditDocument(doc, userId)) return null;
  return doc;
}

export async function createDocument(input: { parentId?: string | null; title?: string; visibility?: "workspace" | "private" } = {}) {
  const c = await ctx();
  if (!c) return { error: "Not signed in" };
  // A subpage inherits its parent's visibility so it nests in the same section;
  // top-level pages default to workspace (unless overridden).
  let visibility: "workspace" | "private" = input.visibility === "private" ? "private" : "workspace";
  if (input.parentId) {
    const parent = await getReadableDocument(c.orgId, c.userId, input.parentId);
    if (parent) visibility = parent.visibility === "private" ? "private" : "workspace";
  }
  const id = crypto.randomUUID();
  await db.insert(document).values({
    id,
    organizationId: c.orgId,
    parentId: input.parentId ?? null,
    title: input.title?.trim() || "Untitled",
    visibility,
    authorId: c.userId,
    createdBy: c.userId,
  });
  revalidatePath("/wiki");
  return { id };
}

export async function renameDocument(id: string, title: string) {
  const c = await ctx();
  if (!c) return { error: "Not signed in" };
  if (!(await editable(c.orgId, c.userId, id))) return { error: "Not allowed" };
  await db.update(document).set({ title: title.trim() || "Untitled", lastEditedBy: c.userId, updatedAt: new Date() }).where(eq(document.id, id));
  revalidatePath("/wiki");
  revalidatePath(`/wiki/${id}`);
  return { ok: true };
}

export async function updateDocumentBody(id: string, body: unknown, contentText: string) {
  const c = await ctx();
  if (!c) return { error: "Not signed in" };
  if (!(await editable(c.orgId, c.userId, id))) return { error: "Not allowed" };
  await db.update(document).set({ body: body as never, contentText, lastEditedBy: c.userId, updatedAt: new Date() }).where(eq(document.id, id));
  return { ok: true };
}

export async function setDocumentVisibility(id: string, visibility: "workspace" | "private") {
  const c = await ctx();
  if (!c) return { error: "Not signed in" };
  if (!(await editable(c.orgId, c.userId, id))) return { error: "Not allowed" };
  await db.update(document).set({ visibility, lastEditedBy: c.userId, updatedAt: new Date() }).where(eq(document.id, id));
  revalidatePath("/wiki");
  revalidatePath(`/wiki/${id}`);
  return { ok: true };
}

export async function archiveDocument(id: string, archived: boolean) {
  const c = await ctx();
  if (!c) return { error: "Not signed in" };
  if (!(await editable(c.orgId, c.userId, id))) return { error: "Not allowed" };
  await db.update(document).set({ archived, lastEditedBy: c.userId, updatedAt: new Date() }).where(eq(document.id, id));
  revalidatePath("/wiki");
  return { ok: true };
}

/** Log a page view (best-effort; only if the user may read it). Powers view stats. */
export async function recordView(id: string) {
  const c = await ctx();
  if (!c) return { error: "Not signed in" };
  const doc = await getReadableDocument(c.orgId, c.userId, id);
  if (!doc) return { error: "Not found" };
  await db.insert(documentView).values({ id: crypto.randomUUID(), documentId: id, userId: c.userId });
  return { ok: true };
}

/** Permanently delete a page AND all its descendants (parentId has no FK cascade). */
export async function deleteDocument(id: string) {
  const c = await ctx();
  if (!c) return { error: "Not signed in" };
  if (!(await editable(c.orgId, c.userId, id))) return { error: "Not allowed" };

  const all = await db
    .select({ id: document.id, parentId: document.parentId })
    .from(document)
    .where(eq(document.organizationId, c.orgId));
  const toDelete = new Set<string>([id]);
  for (let changed = true; changed; ) {
    changed = false;
    for (const row of all) {
      if (row.parentId && toDelete.has(row.parentId) && !toDelete.has(row.id)) {
        toDelete.add(row.id);
        changed = true;
      }
    }
  }
  // Deleting the documents cascades their versions + project_document links (FKs).
  await db.delete(document).where(inArray(document.id, [...toDelete]));
  revalidatePath("/wiki");
  return { ok: true, deleted: toDelete.size };
}
