import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "./db";
import { project, knowledgeItem, user } from "./db/schema";
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

/** The caller's membership if they belong to an org, for org-level knowledge. */
export async function getAccessibleOrg() {
  const m = await getActiveMembership();
  if (!m?.orgId) return null;
  return { membership: m };
}

/** Uploader, project creator, or an org owner/admin may delete a project item. */
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

/** Uploader or an org owner/admin may delete an org-level item. */
export function canDeleteOrgItem(
  item: { uploadedBy: string | null },
  membership: { userId: string; role: string | null },
) {
  return item.uploadedBy === membership.userId || canManageOrg(membership.role);
}

export async function listKnowledge(projectId: string) {
  return db
    .select()
    .from(knowledgeItem)
    .where(eq(knowledgeItem.projectId, projectId))
    .orderBy(desc(knowledgeItem.createdAt));
}

/**
 * The whole organization knowledge space: every project's items rolled up plus
 * org-level items (projectId = null), each tagged with its project (or null).
 */
export async function listOrgKnowledge(orgId: string) {
  return db
    .select({
      id: knowledgeItem.id,
      source: knowledgeItem.source,
      title: knowledgeItem.title,
      mimeType: knowledgeItem.mimeType,
      sizeBytes: knowledgeItem.sizeBytes,
      storageKey: knowledgeItem.storageKey,
      uploadedBy: knowledgeItem.uploadedBy,
      uploaderName: user.name,
      uploaderEmail: user.email,
      projectId: knowledgeItem.projectId,
      projectName: project.name,
      createdAt: knowledgeItem.createdAt,
    })
    .from(knowledgeItem)
    .leftJoin(user, eq(user.id, knowledgeItem.uploadedBy))
    .leftJoin(project, eq(project.id, knowledgeItem.projectId))
    .where(eq(knowledgeItem.organizationId, orgId))
    .orderBy(desc(knowledgeItem.createdAt));
}

/**
 * Retrieval hook for the AI layer. A project draws on the ENTIRE organization
 * knowledge base — org-level items plus every project's knowledge — not just its
 * own, so a brand-new project immediately benefits from prior work. Each row is
 * tagged so the model can weight the current project's own knowledge higher.
 */
export async function getKnowledgeForAI(projectId: string) {
  const p = (await db.select().from(project).where(eq(project.id, projectId)).limit(1))[0];
  if (!p) return [];
  const rows = await db
    .select({
      id: knowledgeItem.id,
      title: knowledgeItem.title,
      source: knowledgeItem.source,
      content: knowledgeItem.content,
      projectId: knowledgeItem.projectId,
      createdAt: knowledgeItem.createdAt,
    })
    .from(knowledgeItem)
    .where(eq(knowledgeItem.organizationId, p.organizationId))
    .orderBy(desc(knowledgeItem.createdAt));

  return rows
    .filter((r) => r.content && r.content.trim().length > 0)
    .map((r) => ({
      id: r.id,
      title: r.title,
      source: r.source,
      content: r.content as string,
      scope: r.projectId == null ? "organization" : r.projectId === projectId ? "this-project" : "other-project",
      updatedAtISO: new Date(r.createdAt).toISOString(),
    }));
}

/** Org-level knowledge only (projectId = null) — used when no project context. */
export async function getOrgKnowledgeForAI(orgId: string) {
  const rows = await db
    .select({ title: knowledgeItem.title, source: knowledgeItem.source, content: knowledgeItem.content })
    .from(knowledgeItem)
    .where(and(eq(knowledgeItem.organizationId, orgId), isNull(knowledgeItem.projectId)))
    .orderBy(desc(knowledgeItem.createdAt));
  return rows.filter((r) => r.content && r.content.trim().length > 0);
}
