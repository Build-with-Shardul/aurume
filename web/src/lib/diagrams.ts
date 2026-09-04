import { and, desc, eq, or } from "drizzle-orm";
import { db } from "./db";
import { diagram, user } from "./db/schema";

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
