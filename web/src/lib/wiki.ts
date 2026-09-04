import { and, eq, or, desc, asc, inArray } from "drizzle-orm";
import { db } from "./db";
import { document, projectDocument, projectMember, documentView, documentReaction, documentComment, documentVersion, documentEvent, documentShare, project, member, user } from "./db/schema";

function fmtWhen(d: Date) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(d);
}

export type WikiNode = {
  id: string;
  title: string;
  icon: string | null;
  parentId: string | null;
  visibility: string;
  status: string;
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
      status: document.status,
      archived: document.archived,
      orderIndex: document.orderIndex,
      authorId: document.authorId,
    })
    .from(document)
    // Your own pages (any status) + everyone's PUBLISHED workspace pages. Others' drafts are hidden.
    .where(and(eq(document.organizationId, orgId), or(eq(document.authorId, userId), and(eq(document.visibility, "workspace"), eq(document.status, "published")))))
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
  if (doc.authorId === userId) return doc;
  // An explicit per-user share grants access — even for a draft.
  const shared = await db
    .select({ id: documentShare.id })
    .from(documentShare)
    .where(and(eq(documentShare.documentId, docId), eq(documentShare.userId, userId)))
    .limit(1);
  if (shared.length) return doc;
  // Otherwise drafts are author-only.
  if (doc.status === "draft") return null;
  if (doc.visibility === "workspace") return doc;
  const granted = await db
    .select({ id: projectDocument.id })
    .from(projectDocument)
    .innerJoin(projectMember, eq(projectMember.projectId, projectDocument.projectId))
    .where(and(eq(projectDocument.documentId, docId), eq(projectMember.userId, userId)))
    .limit(1);
  return granted.length ? doc : null;
}

export type ShareUser = { id: string; name: string };

/** Users a page is explicitly shared with. */
export async function listShares(docId: string): Promise<ShareUser[]> {
  const rows = await db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(documentShare)
    .innerJoin(user, eq(user.id, documentShare.userId))
    .where(eq(documentShare.documentId, docId));
  return rows.map((r) => ({ id: r.id, name: r.name || r.email || "Someone" }));
}

/** Users who can be @mentioned on a page: the members of every project the page is
 * mapped into (union). If the page is in no project, all workspace members. Excludes self. */
export async function listMentionableUsers(orgId: string, userId: string, docId: string): Promise<ShareUser[]> {
  const mapped = await db.select({ projectId: projectDocument.projectId }).from(projectDocument).where(eq(projectDocument.documentId, docId));
  let rows: { id: string; name: string | null; email: string }[];
  if (mapped.length) {
    rows = await db
      .select({ id: user.id, name: user.name, email: user.email })
      .from(projectMember)
      .innerJoin(user, eq(user.id, projectMember.userId))
      .where(inArray(projectMember.projectId, mapped.map((m) => m.projectId)));
  } else {
    rows = await db
      .select({ id: user.id, name: user.name, email: user.email })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(eq(member.organizationId, orgId));
  }
  const seen = new Set<string>();
  const out: ShareUser[] = [];
  for (const r of rows) {
    if (r.id === userId || seen.has(r.id)) continue;
    seen.add(r.id);
    out.push({ id: r.id, name: r.name || r.email || "Someone" });
  }
  return out;
}

/** Workspace members who could be added as sharers (excludes the author + already-shared). */
export async function listShareableUsers(orgId: string, docId: string, authorId: string | null): Promise<ShareUser[]> {
  const members = await db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(eq(member.organizationId, orgId));
  const already = new Set((await db.select({ userId: documentShare.userId }).from(documentShare).where(eq(documentShare.documentId, docId))).map((s) => s.userId));
  return members.filter((m) => m.id !== authorId && !already.has(m.id)).map((m) => ({ id: m.id, name: m.name || m.email || "Someone" }));
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
  sharedWith: string[]; // names of projects this page is mapped into
};

export type MappableDoc = { id: string; title: string; icon: string | null; visibility: string };

/** Org Wiki docs the user can read that aren't already mapped into this project. */
export async function listMappableDocuments(orgId: string, userId: string, projectId: string): Promise<MappableDoc[]> {
  const tree = await listWikiTree(orgId, userId); // workspace + own private, non-archived
  const mapped = await db.select({ documentId: projectDocument.documentId }).from(projectDocument).where(eq(projectDocument.projectId, projectId));
  const mappedSet = new Set(mapped.map((m) => m.documentId));
  return tree.filter((n) => !mappedSet.has(n.id)).map((n) => ({ id: n.id, title: n.title, icon: n.icon, visibility: n.visibility }));
}

/** Wiki docs currently mapped into a project's knowledge base. */
export async function listMappedDocuments(projectId: string): Promise<MappableDoc[]> {
  return db
    .select({ id: document.id, title: document.title, icon: document.icon, visibility: document.visibility })
    .from(projectDocument)
    .innerJoin(document, eq(document.id, projectDocument.documentId))
    .where(eq(projectDocument.projectId, projectId))
    .orderBy(asc(document.title));
}

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

  const shared = await db
    .select({ name: project.name })
    .from(projectDocument)
    .innerJoin(project, eq(project.id, projectDocument.projectId))
    .where(eq(projectDocument.documentId, doc.id));

  return { authorName: nameOf(doc.authorId), lastEditedByName: nameOf(doc.lastEditedBy), totalViews: views.length, viewsByDate, sharedWith: shared.map((s) => s.name) };
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

export type CommentItem = { id: string; parentId: string | null; authorId: string | null; authorName: string; body: string; quote: string | null; createdLabel: string };

/** All comments on a document, oldest first (client builds the tree via parentId). */
export async function listComments(docId: string): Promise<CommentItem[]> {
  const rows = await db
    .select({
      id: documentComment.id,
      parentId: documentComment.parentId,
      authorId: documentComment.authorId,
      body: documentComment.body,
      quote: documentComment.quote,
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
    quote: r.quote,
    createdLabel: fmtWhen(r.createdAt),
  }));
}

export type HistoryItem = { id: string; kind: "version" | "event"; type: string; label: string; actorName: string; whenLabel: string; versionId?: string };

function eventLabel(type: string, detail: string | null) {
  switch (type) {
    case "created": return "created this page";
    case "published": return "published this page";
    case "republished": return "published changes";
    case "renamed": return `renamed to "${detail ?? "Untitled"}"`;
    case "visibility_private": return "changed visibility to Private";
    case "visibility_workspace": return "changed visibility to Workspace";
    case "archived": return "archived this page";
    case "unarchived": return "restored from archive";
    case "restored": return "restored an earlier version";
    default: return type;
  }
}

/** Merged change log: content-edit version snapshots (restorable) + discrete events, newest first. */
export async function listHistory(docId: string): Promise<HistoryItem[]> {
  const [versions, events] = await Promise.all([
    db
      .select({ id: documentVersion.id, createdAt: documentVersion.createdAt, name: user.name, email: user.email })
      .from(documentVersion)
      .leftJoin(user, eq(user.id, documentVersion.editedBy))
      .where(eq(documentVersion.documentId, docId)),
    db
      .select({ id: documentEvent.id, type: documentEvent.type, detail: documentEvent.detail, createdAt: documentEvent.createdAt, name: user.name, email: user.email })
      .from(documentEvent)
      .leftJoin(user, eq(user.id, documentEvent.actorId))
      .where(eq(documentEvent.documentId, docId)),
  ]);
  const items: (HistoryItem & { ts: number })[] = [];
  for (const v of versions) {
    items.push({ id: v.id, kind: "version", type: "edited", label: "made edits", actorName: v.name || v.email || "Someone", whenLabel: fmtWhen(v.createdAt), versionId: v.id, ts: v.createdAt.getTime() });
  }
  for (const e of events) {
    items.push({ id: e.id, kind: "event", type: e.type, label: eventLabel(e.type, e.detail), actorName: e.name || e.email || "Someone", whenLabel: fmtWhen(e.createdAt), ts: e.createdAt.getTime() });
  }
  items.sort((a, b) => b.ts - a.ts);
  return items.map(({ ts, ...rest }) => { void ts; return rest; });
}
