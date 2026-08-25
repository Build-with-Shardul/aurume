"use server";

import { and, eq } from "drizzle-orm";
import { getActiveMembership, canCreateProject, canManageOrg } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { project, projectMember, member } from "@/lib/db/schema";

async function orgMemberIds(orgId: string): Promise<Set<string>> {
  const rows = await db.select({ userId: member.userId }).from(member).where(eq(member.organizationId, orgId));
  return new Set(rows.map((r) => r.userId));
}

export async function createProject(input: {
  name: string;
  description?: string;
  budget?: number | null;
  currency: string;
  startDate?: string | null;
  endDate?: string | null;
  memberIds: string[];
}) {
  const m = await getActiveMembership();
  if (!m?.orgId) return { error: "No workspace found." };
  if (!canCreateProject(m.role)) return { error: "You don't have permission to create projects." };

  const name = input.name?.trim();
  if (!name) return { error: "Project name is required." };

  const id = crypto.randomUUID();
  await db.insert(project).values({
    id,
    organizationId: m.orgId,
    name,
    description: input.description?.trim() || null,
    budget: input.budget ?? null,
    currency: input.currency || "USD",
    startDate: input.startDate || null,
    endDate: input.endDate || null,
    createdBy: m.userId,
  });

  const valid = await orgMemberIds(m.orgId);
  const ids = Array.from(new Set([m.userId, ...(input.memberIds || [])])).filter((u) => valid.has(u));
  for (const userId of ids) {
    await db
      .insert(projectMember)
      .values({ id: crypto.randomUUID(), projectId: id, userId })
      .onConflictDoNothing();
  }

  return { ok: true, id };
}

/** Add/remove members allowed for the project creator or an org owner/admin. */
async function canManageProject(projectId: string) {
  const m = await getActiveMembership();
  if (!m?.orgId) return null;
  const p = (await db.select().from(project).where(eq(project.id, projectId)).limit(1))[0];
  if (!p || p.organizationId !== m.orgId) return null;
  if (canManageOrg(m.role) || p.createdBy === m.userId) return m;
  return null;
}

export async function addProjectMember(projectId: string, userId: string) {
  const m = await canManageProject(projectId);
  if (!m?.orgId) return { error: "Not allowed." };
  const valid = await orgMemberIds(m.orgId);
  if (!valid.has(userId)) return { error: "That person isn't in this workspace." };
  await db
    .insert(projectMember)
    .values({ id: crypto.randomUUID(), projectId, userId })
    .onConflictDoNothing();
  return { ok: true };
}

export async function removeProjectMember(projectId: string, userId: string) {
  const m = await canManageProject(projectId);
  if (!m) return { error: "Not allowed." };
  await db
    .delete(projectMember)
    .where(and(eq(projectMember.projectId, projectId), eq(projectMember.userId, userId)));
  return { ok: true };
}
