"use server";

import { and, eq } from "drizzle-orm";
import { getActiveMembership, canCreateProject, canManageOrg } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { project, projectMember, member } from "@/lib/db/schema";
import { isProjectStarted } from "@/lib/dates";

async function orgMemberIds(orgId: string): Promise<Set<string>> {
  const rows = await db.select({ userId: member.userId }).from(member).where(eq(member.organizationId, orgId));
  return new Set(rows.map((r) => r.userId));
}

export async function createProject(input: {
  name: string;
  description?: string;
  budget?: number | null;
  currency: string;
  hoursPerPoint?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  members: Array<{ userId: string; rate?: number | null; timezone?: string | null; hoursPerDay?: number | null }>;
}) {
  const m = await getActiveMembership();
  if (!m?.orgId) return { error: "No workspace found." };
  if (!canCreateProject(m.role)) return { error: "You don't have permission to create projects." };

  const name = input.name?.trim();
  if (!name) return { error: "Project name is required." };
  if (input.budget == null || Number.isNaN(input.budget)) return { error: "Budget is required." };
  if (!input.currency) return { error: "Currency is required." };
  if (!input.startDate) return { error: "Expected start is required." };
  if (!input.endDate) return { error: "Expected end is required." };
  for (const r of input.members || []) {
    if (r.rate == null || Number.isNaN(r.rate)) return { error: "An hourly rate is required for every added member." };
    if (!r.timezone) return { error: "A timezone is required for every added member." };
  }

  const id = crypto.randomUUID();
  await db.insert(project).values({
    id,
    organizationId: m.orgId,
    name,
    description: input.description?.trim() || null,
    budget: input.budget,
    currency: input.currency,
    hoursPerPoint: input.hoursPerPoint && input.hoursPerPoint > 0 ? Math.round(input.hoursPerPoint) : 8,
    startDate: input.startDate,
    endDate: input.endDate,
    createdBy: m.userId,
  });

  const valid = await orgMemberIds(m.orgId);
  const byId = new Map<string, { rate: number | null; timezone: string | null; hoursPerDay: number }>();
  for (const r of input.members || []) {
    if (valid.has(r.userId)) byId.set(r.userId, { rate: r.rate ?? null, timezone: r.timezone ?? null, hoursPerDay: r.hoursPerDay && r.hoursPerDay > 0 ? Math.round(r.hoursPerDay) : 8 });
  }
  // The creator is always on the project; their rate/timezone can be set afterward.
  if (!byId.has(m.userId)) byId.set(m.userId, { rate: null, timezone: null, hoursPerDay: 8 });
  for (const [userId, v] of byId) {
    await db
      .insert(projectMember)
      .values({ id: crypto.randomUUID(), projectId: id, userId, rate: v.rate, timezone: v.timezone, hoursPerDay: v.hoursPerDay })
      .onConflictDoNothing();
  }

  return { ok: true, id };
}

export async function updateProjectSettings(
  projectId: string,
  input: { budget: number | null; startDate: string | null; endDate: string | null; hoursPerPoint?: number | null },
) {
  const m = await canManageProject(projectId);
  if (!m) return { error: "Not allowed." };
  const p = (await db.select().from(project).where(eq(project.id, projectId)).limit(1))[0];
  if (!p) return { error: "Project not found." };

  if (input.budget == null || Number.isNaN(input.budget)) return { error: "Budget is required." };
  if (!input.endDate) return { error: "Expected end is required." };
  const hoursPerPoint = input.hoursPerPoint && input.hoursPerPoint > 0 ? Math.round(input.hoursPerPoint) : p.hoursPerPoint;

  const started = isProjectStarted(p.startDate);
  // Once a project has started its start date is locked; otherwise it stays editable.
  const startDate = started ? p.startDate : input.startDate;
  if (!startDate) return { error: "Expected start is required." };
  if (input.endDate < startDate) return { error: "Expected end can't be before the start date." };

  await db
    .update(project)
    .set({ budget: input.budget, startDate, endDate: input.endDate, hoursPerPoint, updatedAt: new Date() })
    .where(eq(project.id, projectId));
  return { ok: true };
}

export async function updateProjectChannels(
  projectId: string,
  input: { slackChannel: string | null; teamsChannel: string | null },
) {
  const m = await canManageProject(projectId);
  if (!m) return { error: "Not allowed." };
  await db
    .update(project)
    .set({
      slackChannel: input.slackChannel?.trim() || null,
      teamsChannel: input.teamsChannel?.trim() || null,
      updatedAt: new Date(),
    })
    .where(eq(project.id, projectId));
  return { ok: true };
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

export async function addProjectMember(
  projectId: string,
  userId: string,
  rate: number | null,
  timezone: string | null,
  hoursPerDay?: number | null,
) {
  const m = await canManageProject(projectId);
  if (!m?.orgId) return { error: "Not allowed." };
  if (rate == null || Number.isNaN(rate)) return { error: "An hourly rate is required." };
  if (!timezone) return { error: "A timezone is required." };
  const valid = await orgMemberIds(m.orgId);
  if (!valid.has(userId)) return { error: "That person isn't in this workspace." };
  await db
    .insert(projectMember)
    .values({ id: crypto.randomUUID(), projectId, userId, rate, timezone, hoursPerDay: hoursPerDay && hoursPerDay > 0 ? Math.round(hoursPerDay) : 8 })
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

export async function updateProjectMember(
  projectId: string,
  userId: string,
  rate: number | null,
  timezone: string | null,
  hoursPerDay?: number | null,
) {
  const m = await canManageProject(projectId);
  if (!m) return { error: "Not allowed." };
  if (rate == null || Number.isNaN(rate)) return { error: "An hourly rate is required." };
  if (!timezone) return { error: "A timezone is required." };
  await db
    .update(projectMember)
    .set({ rate, timezone, ...(hoursPerDay && hoursPerDay > 0 ? { hoursPerDay: Math.round(hoursPerDay) } : {}) })
    .where(and(eq(projectMember.projectId, projectId), eq(projectMember.userId, userId)));
  return { ok: true };
}
