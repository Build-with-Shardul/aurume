"use server";

import { and, desc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { document, documentView, documentAsset, documentReaction, documentComment, documentVersion, documentEvent } from "@/lib/db/schema";
import { getSession, getActiveMembership } from "@/lib/auth-server";
import { getReadableDocument, canEditDocument, listHistory } from "@/lib/wiki";
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

async function logEvent(docId: string, type: string, detail: string | null, actorId: string) {
  await db.insert(documentEvent).values({ id: crypto.randomUUID(), documentId: docId, type, detail, actorId });
}

// Coalesce rapid autosaves: snapshot a version only when the newest is >3 min old (or none).
async function maybeSnapshot(docId: string, actorId: string, title: string, body: unknown, contentText: string) {
  const last = await db.select({ createdAt: documentVersion.createdAt }).from(documentVersion).where(eq(documentVersion.documentId, docId)).orderBy(desc(documentVersion.createdAt)).limit(1);
  const stale = !last[0] || Date.now() - last[0].createdAt.getTime() > 3 * 60 * 1000;
  if (stale) await db.insert(documentVersion).values({ id: crypto.randomUUID(), documentId: docId, title, body: body as never, contentText, editedBy: actorId });
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
  await logEvent(id, "created", null, c.userId);
  revalidatePath("/wiki");
  return { id };
}

export async function renameDocument(id: string, title: string) {
  const c = await ctx();
  if (!c) return { error: "Not signed in" };
  if (!(await editable(c.orgId, c.userId, id))) return { error: "Not allowed" };
  await db.update(document).set({ title: title.trim() || "Untitled", lastEditedBy: c.userId, updatedAt: new Date() }).where(eq(document.id, id));
  await logEvent(id, "renamed", title.trim() || "Untitled", c.userId);
  revalidatePath("/wiki");
  revalidatePath(`/wiki/${id}`);
  return { ok: true };
}

export async function updateDocumentBody(id: string, body: unknown, contentText: string) {
  const c = await ctx();
  if (!c) return { error: "Not signed in" };
  const doc = await editable(c.orgId, c.userId, id);
  if (!doc) return { error: "Not allowed" };
  // Edits go to the WORKING copy. If the page is published, this creates unpublished changes.
  await db.update(document).set({ body: body as never, contentText, hasUnpublishedChanges: doc.status === "published", lastEditedBy: c.userId, updatedAt: new Date() }).where(eq(document.id, id));
  await maybeSnapshot(id, c.userId, doc.title, body, contentText);
  return { ok: true };
}

export async function setDocumentVisibility(id: string, visibility: "workspace" | "private") {
  const c = await ctx();
  if (!c) return { error: "Not signed in" };
  if (!(await editable(c.orgId, c.userId, id))) return { error: "Not allowed" };
  await db.update(document).set({ visibility, lastEditedBy: c.userId, updatedAt: new Date() }).where(eq(document.id, id));
  await logEvent(id, visibility === "private" ? "visibility_private" : "visibility_workspace", null, c.userId);
  revalidatePath("/wiki");
  revalidatePath(`/wiki/${id}`);
  return { ok: true };
}

/** Publish: promote the working copy to the published copy (readers now see it) and
 * clear unpublished-changes. Works for first publish and every re-publish. */
export async function publishDocument(id: string) {
  const c = await ctx();
  if (!c) return { error: "Not signed in" };
  const doc = await editable(c.orgId, c.userId, id);
  if (!doc) return { error: "Not allowed" };
  const wasPublished = doc.status === "published";
  await db
    .update(document)
    .set({ status: "published", publishedBody: doc.body as never, publishedContentText: doc.contentText, hasUnpublishedChanges: false, lastEditedBy: c.userId, updatedAt: new Date() })
    .where(eq(document.id, id));
  await logEvent(id, wasPublished ? "republished" : "published", null, c.userId);
  revalidatePath("/wiki");
  revalidatePath(`/wiki/${id}`);
  return { ok: true };
}

export async function archiveDocument(id: string, archived: boolean) {
  const c = await ctx();
  if (!c) return { error: "Not signed in" };
  if (!(await editable(c.orgId, c.userId, id))) return { error: "Not allowed" };
  await db.update(document).set({ archived, lastEditedBy: c.userId, updatedAt: new Date() }).where(eq(document.id, id));
  await logEvent(id, archived ? "archived" : "unarchived", null, c.userId);
  revalidatePath("/wiki");
  return { ok: true };
}

/** Restore a page to an earlier version (snapshots the current state first). */
export async function restoreVersion(versionId: string) {
  const c = await ctx();
  if (!c) return { error: "Not signed in" };
  const vrows = await db.select().from(documentVersion).where(eq(documentVersion.id, versionId)).limit(1);
  const v = vrows[0];
  if (!v) return { error: "Not found" };
  const doc = await editable(c.orgId, c.userId, v.documentId);
  if (!doc) return { error: "Not allowed" };
  // Keep the current state as a version so restore is itself reversible.
  await db.insert(documentVersion).values({ id: crypto.randomUUID(), documentId: v.documentId, title: doc.title, body: doc.body as never, contentText: doc.contentText, editedBy: c.userId });
  await db.update(document).set({ title: v.title, body: v.body as never, contentText: v.contentText, lastEditedBy: c.userId, updatedAt: new Date() }).where(eq(document.id, v.documentId));
  await logEvent(v.documentId, "restored", null, c.userId);
  revalidatePath("/wiki");
  revalidatePath(`/wiki/${v.documentId}`);
  return { ok: true };
}

/** Fetch the merged change log for a page (readers only). */
export async function getHistory(docId: string) {
  const c = await ctx();
  if (!c) return { error: "Not signed in" as const };
  const doc = await getReadableDocument(c.orgId, c.userId, docId);
  if (!doc) return { error: "Not found" as const };
  return { items: await listHistory(docId) };
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

/** Create an inline (anchored) comment thread from a text selection. Returns the
 * root comment id so the caller can apply the anchor mark to the range. */
export async function addInlineComment(docId: string, quote: string, body: string) {
  const c = await ctx();
  if (!c) return { error: "Not signed in" };
  const text = (body || "").trim();
  if (!text) return { error: "Empty comment" };
  const doc = await getReadableDocument(c.orgId, c.userId, docId);
  if (!doc) return { error: "Not found" };
  const id = crypto.randomUUID();
  await db.insert(documentComment).values({ id, documentId: docId, parentId: null, authorId: c.userId, body: text, quote: quote.slice(0, 300) });
  revalidatePath(`/wiki/${docId}`);
  return { id };
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

/** Move a page/folder under a new parent (or to a section root). Visibility follows
 * the destination and cascades to the whole moved subtree. Cycle-safe. */
export async function moveDocument(docId: string, newParentId: string | null, sectionVisibility?: "workspace" | "private") {
  const c = await ctx();
  if (!c) return { error: "Not signed in" };
  const doc = await editable(c.orgId, c.userId, docId);
  if (!doc) return { error: "Not allowed" };

  const all = await db.select({ id: document.id, parentId: document.parentId }).from(document).where(eq(document.organizationId, c.orgId));
  const subtree = new Set<string>([docId]); // docId + all descendants
  for (let changed = true; changed; ) {
    changed = false;
    for (const r of all) {
      if (r.parentId && subtree.has(r.parentId) && !subtree.has(r.id)) { subtree.add(r.id); changed = true; }
    }
  }

  let destVis: "workspace" | "private";
  if (newParentId) {
    if (subtree.has(newParentId)) return { error: "Can't move a page into itself or its own subpage." };
    const parent = await getReadableDocument(c.orgId, c.userId, newParentId);
    if (!parent) return { error: "Destination not found" };
    destVis = parent.visibility === "private" ? "private" : "workspace";
  } else {
    destVis = sectionVisibility === "private" ? "private" : "workspace";
  }

  await db.update(document).set({ parentId: newParentId ?? null, lastEditedBy: c.userId, updatedAt: new Date() }).where(eq(document.id, docId));
  if (doc.visibility !== destVis) {
    await db.update(document).set({ visibility: destVis, lastEditedBy: c.userId, updatedAt: new Date() }).where(inArray(document.id, [...subtree]));
    await logEvent(docId, destVis === "private" ? "visibility_private" : "visibility_workspace", null, c.userId);
  }
  revalidatePath("/wiki");
  revalidatePath(`/wiki/${docId}`);
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
