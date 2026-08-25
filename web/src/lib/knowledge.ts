import { and, desc, eq } from "drizzle-orm";
import { db } from "./db";
import { project, knowledgeItem } from "./db/schema";
import { getActiveMembership, canManageOrg } from "./auth-server";

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB per file

/**
 * Resolve a project the current user may access (same org). Returns the project
 * row plus the caller's membership, or null. Any org member can view/upload to a
 * project's knowledge space; deletion is gated separately.
 */
export async function getAccessibleProject(projectId: string) {
  const m = await getActiveMembership();
  if (!m?.orgId) return null;
  const p = (await db.select().from(project).where(eq(project.id, projectId)).limit(1))[0];
  if (!p || p.organizationId !== m.orgId) return null;
  return { project: p, membership: m };
}

/** Uploader, project creator, or an org owner/admin may delete an item. */
export function canDeleteItem(
  item: { uploadedBy: string | null },
  project: { createdBy: string | null },
  membership: { userId: string; role: string | null },
) {
  return (
    item.uploadedBy === membership.userId ||
    project.createdBy === membership.userId ||
    canManageOrg(membership.role)
  );
}

export async function listKnowledge(projectId: string) {
  return db
    .select()
    .from(knowledgeItem)
    .where(eq(knowledgeItem.projectId, projectId))
    .orderBy(desc(knowledgeItem.createdAt));
}

/**
 * Retrieval hook for the AI layer: the text the model should reference when
 * drafting playbooks and other project artifacts. Today it returns notes and
 * synced messages (which carry `content`); once document parsing lands, uploaded
 * files will populate `content` too and flow through here unchanged.
 */
export async function getKnowledgeForAI(projectId: string) {
  const rows = await db
    .select({
      title: knowledgeItem.title,
      source: knowledgeItem.source,
      content: knowledgeItem.content,
      createdAt: knowledgeItem.createdAt,
    })
    .from(knowledgeItem)
    .where(and(eq(knowledgeItem.projectId, projectId)))
    .orderBy(desc(knowledgeItem.createdAt));
  return rows.filter((r) => r.content && r.content.trim().length > 0);
}
