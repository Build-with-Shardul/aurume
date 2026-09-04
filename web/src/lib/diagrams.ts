import { and, desc, eq } from "drizzle-orm";
import { db } from "./db";
import { diagram, user } from "./db/schema";

export type DiagramCard = {
  id: string;
  title: string;
  preview: string | null;
  updatedAt: Date;
  authorName: string | null;
};

/** All diagrams in the workspace, newest first. */
export async function listDiagrams(orgId: string): Promise<DiagramCard[]> {
  const rows = await db
    .select({
      id: diagram.id,
      title: diagram.title,
      preview: diagram.preview,
      updatedAt: diagram.updatedAt,
      name: user.name,
      email: user.email,
    })
    .from(diagram)
    .leftJoin(user, eq(user.id, diagram.lastEditedBy))
    .where(eq(diagram.organizationId, orgId))
    .orderBy(desc(diagram.updatedAt));
  return rows.map((r) => ({ id: r.id, title: r.title, preview: r.preview, updatedAt: r.updatedAt, authorName: r.name || r.email || null }));
}

/** A single diagram the user may access (same workspace). Returns null otherwise. */
export async function getDiagram(orgId: string, id: string) {
  const rows = await db.select().from(diagram).where(and(eq(diagram.id, id), eq(diagram.organizationId, orgId))).limit(1);
  return rows[0] ?? null;
}

/** Minimal id→(title, preview) for embedding diagrams into wiki pages (live-resolved). */
export async function listEmbeddableDiagrams(orgId: string): Promise<{ id: string; title: string; preview: string | null }[]> {
  const rows = await db
    .select({ id: diagram.id, title: diagram.title, preview: diagram.preview })
    .from(diagram)
    .where(eq(diagram.organizationId, orgId))
    .orderBy(desc(diagram.updatedAt));
  return rows;
}
