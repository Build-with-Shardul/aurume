"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { document, documentView, documentAsset, documentReaction, documentComment } from "@/lib/db/schema";
import { getSession, getActiveMembership } from "@/lib/auth-server";
import { getReadableDocument, canEditDocument } from "@/lib/wiki";
import { buildKey, saveFile } from "@/lib/storage";

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

/** Upload an image for embedding in a page. Returns a URL served by /api/wiki/assets/[id]. */
export async function uploadWikiImage(formData: FormData) {
  const c = await ctx();
  if (!c) return { error: "Not signed in" };
  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "No file" };
  if (!file.type.startsWith("image/")) return { error: "Only image files are allowed" };
  if (file.size > 10 * 1024 * 1024) return { error: "Image too large (max 10MB)" };
  const id = crypto.randomUUID();
  const key = buildKey(c.orgId, "wiki", id, file.name || "image");
  await saveFile(key, Buffer.from(await file.arrayBuffer()));
  await db.insert(documentAsset).values({ id, organizationId: c.orgId, storageKey: key, mimeType: file.type, sizeBytes: file.size, createdBy: c.userId });
  return { url: `/api/wiki/assets/${id}` };
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

/** Toggle the current user's emoji reaction on a page. */
export async function toggleReaction(docId: string, emoji: string) {
  const c = await ctx();
  if (!c) return { error: "Not signed in" };
  const doc = await getReadableDocument(c.orgId, c.userId, docId);
  if (!doc) return { error: "Not found" };
  const existing = await db
    .select({ id: documentReaction.id })
    .from(documentReaction)
    .where(and(eq(documentReaction.documentId, docId), eq(documentReaction.userId, c.userId), eq(documentReaction.emoji, emoji)))
    .limit(1);
  if (existing[0]) await db.delete(documentReaction).where(eq(documentReaction.id, existing[0].id));
  else await db.insert(documentReaction).values({ id: crypto.randomUUID(), documentId: docId, userId: c.userId, emoji });
  revalidatePath(`/wiki/${docId}`);
  return { ok: true };
}

/** Add a comment (or a reply when parentId is set). Only readers of the page may comment. */
export async function addComment(docId: string, parentId: string | null, body: string) {
  const c = await ctx();
  if (!c) return { error: "Not signed in" };
  const text = (body || "").trim();
  if (!text) return { error: "Empty comment" };
  const doc = await getReadableDocument(c.orgId, c.userId, docId);
  if (!doc) return { error: "Not found" };
  await db.insert(documentComment).values({ id: crypto.randomUUID(), documentId: docId, parentId: parentId ?? null, authorId: c.userId, body: text });
  revalidatePath(`/wiki/${docId}`);
  return { ok: true };
}

/** Delete a comment (author only) and any nested replies. */
export async function deleteComment(commentId: string) {
  const c = await ctx();
  if (!c) return { error: "Not signed in" };
  const rows = await db.select().from(documentComment).where(eq(documentComment.id, commentId)).limit(1);
  const cm = rows[0];
  if (!cm) return { error: "Not found" };
  const doc = await getReadableDocument(c.orgId, c.userId, cm.documentId);
  if (!doc || cm.authorId !== c.userId) return { error: "Not allowed" };
  const all = await db.select({ id: documentComment.id, parentId: documentComment.parentId }).from(documentComment).where(eq(documentComment.documentId, cm.documentId));
  const toDelete = new Set<string>([commentId]);
  for (let changed = true; changed; ) {
    changed = false;
    for (const r of all) {
      if (r.parentId && toDelete.has(r.parentId) && !toDelete.has(r.id)) { toDelete.add(r.id); changed = true; }
    }
  }
  await db.delete(documentComment).where(inArray(documentComment.id, [...toDelete]));
  revalidatePath(`/wiki/${cm.documentId}`);
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
