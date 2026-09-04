import { and, eq, or, desc, asc, inArray } from "drizzle-orm";
import { db } from "./db";
import { document, projectDocument, projectMember, documentView, documentReaction, documentComment, user } from "./db/schema";

function fmtWhen(d: Date) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(d);
}

export type WikiNode = {
  id: string;
  title: string;
  icon: string | null;
  parentId: string | null;
  visibility: string;
  archived: boolean;
  orderIndex: number;
  authorId: string | null;
};

/**
 * Documents to show in the workspace Wiki tree for this user: workspace-visible
 * pages plus the user's own private pages. (Project-mapped access matters for the
 * doc VIEW and for AI grounding, not for the org Wiki tree.)
 */
export async function listWikiTree(orgId: string, userId: string): Promise<WikiNode[]> {
  const rows = await db
    .select({
      id: document.id,
      title: document.title,
      icon: document.icon,
      parentId: document.parentId,
      visibility: document.visibility,
      archived: document.archived,
      orderIndex: document.orderIndex,
      authorId: document.authorId,
    })
    .from(document)
    .where(and(eq(document.organizationId, orgId), or(eq(document.visibility, "workspace"), eq(document.authorId, userId))))
    .orderBy(desc(document.updatedAt));
  return rows;
}

/**
 * Fetch a document only if the user may read it (the hard access rule):
 *   visibility = "workspace"  OR  author = user  OR  mapped to a project the user is in.
 * Returns null when not readable (callers should 404).
 */
export async function getReadableDocument(orgId: string, userId: string, docId: string) {
  const rows = await db
    .select()
    .from(document)
    .where(and(eq(document.id, docId), eq(document.organizationId, orgId)))
    .limit(1);
  const doc = rows[0];
  if (!doc) return null;
  if (doc.visibility === "workspace" || doc.authorId === userId) return doc;
  const granted = await db
    .select({ id: projectDocument.id })
    .from(projectDocument)
    .innerJoin(projectMember, eq(projectMember.projectId, projectDocument.projectId))
    .where(and(eq(projectDocument.documentId, docId), eq(projectMember.userId, userId)))
    .limit(1);
  return granted.length ? doc : null;
}

/** Workspace docs are collaboratively editable; private docs only by their author. */
export function canEditDocument(doc: { visibility: string; authorId: string | null }, userId: string) {
  return doc.visibility === "workspace" || doc.authorId === userId;
}

export type DocumentMeta = {
  authorName: string | null;
  lastEditedByName: string | null;
  totalViews: number;
  viewsByDate: { date: string; count: number }[];
};

/** People names + date-wise view counts for a document's metadata bar / stats. */
export async function getDocumentMeta(doc: { id: string; authorId: string | null; lastEditedBy: string | null }): Promise<DocumentMeta> {
  const ids = [doc.authorId, doc.lastEditedBy].filter((x): x is string => !!x);
  const people = ids.length
    ? await db.select({ id: user.id, name: user.name, email: user.email }).from(user).where(inArray(user.id, ids))
    : [];
  const nameOf = (id: string | null) => {
    if (!id) return null;
    const u = people.find((p) => p.id === id);
    return u ? u.name || u.email : null;
  };

  const views = await db.select({ viewedAt: documentView.viewedAt }).from(documentView).where(eq(documentView.documentId, doc.id));
  const byDate = new Map<string, number>();
  for (const v of views) {
    const d = v.viewedAt.toISOString().slice(0, 10);
    byDate.set(d, (byDate.get(d) ?? 0) + 1);
  }
  const viewsByDate = [...byDate.entries()].map(([date, count]) => ({ date, count })).sort((a, b) => (a.date < b.date ? 1 : -1));

  return { authorName: nameOf(doc.authorId), lastEditedByName: nameOf(doc.lastEditedBy), totalViews: views.length, viewsByDate };
}

export type ReactionSummary = { emoji: string; count: number; mine: boolean };

/** Aggregated reaction counts for a document, marking the current user's reactions. */
export async function listReactions(docId: string, userId: string): Promise<ReactionSummary[]> {
  const rows = await db.select({ emoji: documentReaction.emoji, userId: documentReaction.userId }).from(documentReaction).where(eq(documentReaction.documentId, docId));
  const map = new Map<string, { count: number; mine: boolean }>();
  for (const r of rows) {
    const cur = map.get(r.emoji) ?? { count: 0, mine: false };
    cur.count += 1;
    if (r.userId === userId) cur.mine = true;
    map.set(r.emoji, cur);
  }
  return [...map.entries()].map(([emoji, v]) => ({ emoji, count: v.count, mine: v.mine })).sort((a, b) => b.count - a.count);
}

export type CommentItem = { id: string; parentId: string | null; authorId: string | null; authorName: string; body: string; createdLabel: string };

/** All comments on a document, oldest first (client builds the tree via parentId). */
export async function listComments(docId: string): Promise<CommentItem[]> {
  const rows = await db
    .select({
      id: documentComment.id,
      parentId: documentComment.parentId,
      authorId: documentComment.authorId,
      body: documentComment.body,
      createdAt: documentComment.createdAt,
      authorName: user.name,
      authorEmail: user.email,
    })
    .from(documentComment)
    .leftJoin(user, eq(user.id, documentComment.authorId))
    .where(eq(documentComment.documentId, docId))
    .orderBy(asc(documentComment.createdAt));
  return rows.map((r) => ({
    id: r.id,
    parentId: r.parentId,
    authorId: r.authorId,
    authorName: r.authorName || r.authorEmail || "Someone",
    body: r.body,
    createdLabel: fmtWhen(r.createdAt),
  }));
}
