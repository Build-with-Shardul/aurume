import { and, asc, desc, eq, inArray, or } from "drizzle-orm";
import { db } from "./db";
import { diagram, diagramComment, diagramReaction, diagramShare, diagramView, projectDiagram, project, projectMember, member, user } from "./db/schema";
import type { CommentItem, ReactionSummary, ShareUser } from "./wiki";

function fmtWhen(d: Date) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(d);
}

export type DiagramCard = {
  id: string;
  title: string;
  preview: string | null;
  updatedAt: Date;
  authorName: string | null;
};

export type DiagramNode = {
  id: string;
  title: string;
  parentId: string | null;
  visibility: string;
  archived: boolean;
  orderIndex: number;
  authorId: string | null;
};

/**
 * Diagrams for the sidebar tree: everyone's workspace-visible diagrams plus the user's
 * own private ones (the sidebar buckets these into All / Private / Archived). Mirrors
 * the Wiki tree rule.
 */
export async function listDiagramTree(orgId: string, userId: string): Promise<DiagramNode[]> {
  const rows = await db
    .select({
      id: diagram.id,
      title: diagram.title,
      parentId: diagram.parentId,
      visibility: diagram.visibility,
      archived: diagram.archived,
      orderIndex: diagram.orderIndex,
      authorId: diagram.authorId,
    })
    .from(diagram)
    .where(and(eq(diagram.organizationId, orgId), or(eq(diagram.visibility, "workspace"), eq(diagram.authorId, userId))))
    .orderBy(desc(diagram.updatedAt));
  return rows;
}

/** All diagrams in the workspace, newest first (list view — access-scoped). */
export async function listDiagrams(orgId: string, userId: string): Promise<DiagramCard[]> {
  const rows = await db
    .select({ id: diagram.id, title: diagram.title, preview: diagram.preview, updatedAt: diagram.updatedAt, name: user.name, email: user.email })
    .from(diagram)
    .leftJoin(user, eq(user.id, diagram.lastEditedBy))
    .where(and(eq(diagram.organizationId, orgId), eq(diagram.archived, false), or(eq(diagram.visibility, "workspace"), eq(diagram.authorId, userId))))
    .orderBy(desc(diagram.updatedAt));
  return rows.map((r) => ({ id: r.id, title: r.title, preview: r.preview, updatedAt: r.updatedAt, authorName: r.name || r.email || null }));
}

/** A diagram the user may read: workspace-visible, or their own (private → author only). */
export async function getReadableDiagram(orgId: string, userId: string, id: string) {
  const rows = await db.select().from(diagram).where(and(eq(diagram.id, id), eq(diagram.organizationId, orgId))).limit(1);
  const d = rows[0];
  if (!d) return null;
  if (d.visibility === "workspace" || d.authorId === userId) return d;
  return null;
}

/** Workspace diagrams are collaboratively editable; private ones only by their author. */
export function canEditDiagram(d: { visibility: string; authorId: string | null }, userId: string) {
  return d.visibility === "workspace" || d.authorId === userId;
}

/** id→(title, preview) for the wiki embed picker — access-scoped to what the user can read. */
export async function listEmbeddableDiagrams(orgId: string, userId: string): Promise<{ id: string; title: string; preview: string | null }[]> {
  return db
    .select({ id: diagram.id, title: diagram.title, preview: diagram.preview })
    .from(diagram)
    .where(and(eq(diagram.organizationId, orgId), eq(diagram.archived, false), or(eq(diagram.visibility, "workspace"), eq(diagram.authorId, userId))))
    .orderBy(desc(diagram.updatedAt));
}

export type { ShareUser } from "./wiki";

export type DiagramMeta = {
  authorName: string | null;
  lastEditedByName: string | null;
  totalViews: number;
  projects: string[]; // names of projects this diagram is mapped into
};

/** People names, view count, and mapped-project names for the diagram details bar. */
export async function getDiagramMeta(d: { id: string; authorId: string | null; lastEditedBy: string | null }): Promise<DiagramMeta> {
  const ids = [d.authorId, d.lastEditedBy].filter((x): x is string => !!x);
  const people = ids.length ? await db.select({ id: user.id, name: user.name, email: user.email }).from(user).where(inArray(user.id, ids)) : [];
  const nameOf = (id: string | null) => {
    if (!id) return null;
    const u = people.find((p) => p.id === id);
    return u ? u.name || u.email : null;
  };
  const views = await db.select({ id: diagramView.id }).from(diagramView).where(eq(diagramView.diagramId, d.id));
  const projs = await db.select({ name: project.name }).from(projectDiagram).innerJoin(project, eq(project.id, projectDiagram.projectId)).where(eq(projectDiagram.diagramId, d.id));
  return { authorName: nameOf(d.authorId), lastEditedByName: nameOf(d.lastEditedBy), totalViews: views.length, projects: projs.map((p) => p.name) };
}

/** Page-level comments on a diagram, oldest first (client builds the tree via parentId). */
export async function listDiagramComments(diagramId: string): Promise<CommentItem[]> {
  const rows = await db
    .select({ id: diagramComment.id, parentId: diagramComment.parentId, authorId: diagramComment.authorId, body: diagramComment.body, createdAt: diagramComment.createdAt, authorName: user.name, authorEmail: user.email })
    .from(diagramComment)
    .leftJoin(user, eq(user.id, diagramComment.authorId))
    .where(eq(diagramComment.diagramId, diagramId))
    .orderBy(asc(diagramComment.createdAt));
  return rows.map((r) => ({ id: r.id, parentId: r.parentId, authorId: r.authorId, authorName: r.authorName || r.authorEmail || "Someone", body: r.body, quote: null, createdLabel: fmtWhen(r.createdAt) }));
}

/** Aggregated reaction counts for a diagram, marking the current user's reactions. */
export async function listDiagramReactions(diagramId: string, userId: string): Promise<ReactionSummary[]> {
  const rows = await db.select({ emoji: diagramReaction.emoji, userId: diagramReaction.userId }).from(diagramReaction).where(eq(diagramReaction.diagramId, diagramId));
  const map = new Map<string, { count: number; mine: boolean }>();
  for (const r of rows) {
    const cur = map.get(r.emoji) ?? { count: 0, mine: false };
    cur.count += 1;
    if (r.userId === userId) cur.mine = true;
    map.set(r.emoji, cur);
  }
  return [...map.entries()].map(([emoji, v]) => ({ emoji, count: v.count, mine: v.mine })).sort((a, b) => b.count - a.count);
}

/** Users a diagram is explicitly shared with. */
export async function listDiagramShares(diagramId: string): Promise<ShareUser[]> {
  const rows = await db.select({ id: user.id, name: user.name, email: user.email }).from(diagramShare).innerJoin(user, eq(user.id, diagramShare.userId)).where(eq(diagramShare.diagramId, diagramId));
  return rows.map((r) => ({ id: r.id, name: r.name || r.email || "Someone" }));
}

/** Workspace members who could be added as sharers (excludes the author + already-shared). */
export async function listShareableDiagramUsers(orgId: string, diagramId: string, authorId: string | null): Promise<ShareUser[]> {
  const members = await db.select({ id: user.id, name: user.name, email: user.email }).from(member).innerJoin(user, eq(user.id, member.userId)).where(eq(member.organizationId, orgId));
  const already = new Set((await db.select({ userId: diagramShare.userId }).from(diagramShare).where(eq(diagramShare.diagramId, diagramId))).map((s) => s.userId));
  return members.filter((m) => m.id !== authorId && !already.has(m.id)).map((m) => ({ id: m.id, name: m.name || m.email || "Someone" }));
}

/** Projects the current user belongs to, flagged with whether the diagram is already mapped in. */
export async function listDiagramProjectOptions(orgId: string, userId: string, diagramId: string): Promise<{ id: string; name: string; mapped: boolean }[]> {
  const projs = await db
    .select({ id: project.id, name: project.name })
    .from(projectMember)
    .innerJoin(project, eq(project.id, projectMember.projectId))
    .where(and(eq(projectMember.userId, userId), eq(project.organizationId, orgId)))
    .orderBy(asc(project.name));
  const mapped = new Set((await db.select({ projectId: projectDiagram.projectId }).from(projectDiagram).where(eq(projectDiagram.diagramId, diagramId))).map((m) => m.projectId));
  const seen = new Set<string>();
  const out: { id: string; name: string; mapped: boolean }[] = [];
  for (const p of projs) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    out.push({ id: p.id, name: p.name, mapped: mapped.has(p.id) });
  }
  return out;
}
