"use server";

import { desc, eq } from "drizzle-orm";
import { getActiveMembership, canCreateProject } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { and } from "drizzle-orm";
import { project, playbook, epic, story, aiGeneration, projectCompliance, projectMember } from "@/lib/db/schema";
import { generateStoriesForEpic } from "@/lib/ai/generate";
import { LLMConfigError } from "@/lib/ai/provider";
import { markTestPlanStale } from "../tests/actions";

type PlaybookContent = {
  projectSummary: string;
  keyHypothesis: string;
  projectType: string;
  inScopeEpics: Array<{ jiraId: string; jiraUrl: string; name: string; scopeDetail: string }>;
};

async function projectCtx(projectId: string) {
  const m = await getActiveMembership();
  if (!m?.orgId) return null;
  const p = (await db.select().from(project).where(eq(project.id, projectId)).limit(1))[0];
  if (!p || p.organizationId !== m.orgId) return null;
  const canWork = canCreateProject(m.role) || p.createdBy === m.userId;
  return { m, project: p, canWork };
}

async function latestPlaybook(projectId: string) {
  return (await db.select().from(playbook).where(eq(playbook.projectId, projectId)).orderBy(desc(playbook.version)).limit(1))[0] ?? null;
}

export async function createEpicsFromPlaybook(projectId: string) {
  const ctx = await projectCtx(projectId);
  if (!ctx) return { error: "Not allowed." };
  if (!ctx.canWork) return { error: "You don't have permission." };
  const pb = await latestPlaybook(projectId);
  if (!pb) return { error: "Generate a product playbook first." };
  const content = pb.content as PlaybookContent;
  const proposed = content.inScopeEpics ?? [];
  if (!proposed.length) return { error: "The playbook has no in-scope epics." };

  const existing = new Set((await db.select({ name: epic.name }).from(epic).where(eq(epic.projectId, projectId))).map((e) => e.name.trim().toLowerCase()));
  const baseOrder = (await db.select({ id: epic.id }).from(epic).where(eq(epic.projectId, projectId))).length;

  let created = 0;
  for (const [i, e] of proposed.entries()) {
    const name = e.name?.trim();
    if (!name || existing.has(name.toLowerCase())) continue;
    await db.insert(epic).values({
      id: crypto.randomUUID(),
      organizationId: ctx.m.orgId!,
      projectId,
      name,
      scopeDetail: e.scopeDetail?.trim() || null,
      jiraId: e.jiraId?.trim() || null,
      jiraUrl: e.jiraUrl?.trim() || null,
      orderIndex: baseOrder + i,
      sourcePlaybookId: pb.id,
      sourceVersion: pb.sourceVersion ?? `v${pb.version}`,
      createdBy: ctx.m.userId,
    });
    created++;
  }
  return { ok: true, created };
}

export async function createEpic(projectId: string, name: string, scopeDetail: string) {
  const ctx = await projectCtx(projectId);
  if (!ctx) return { error: "Not allowed." };
  if (!ctx.canWork) return { error: "You don't have permission." };
  const n = name?.trim();
  if (!n) return { error: "A name is required." };
  const baseOrder = (await db.select({ id: epic.id }).from(epic).where(eq(epic.projectId, projectId))).length;
  await db.insert(epic).values({ id: crypto.randomUUID(), organizationId: ctx.m.orgId!, projectId, name: n, scopeDetail: scopeDetail?.trim() || null, orderIndex: baseOrder, createdBy: ctx.m.userId });
  return { ok: true };
}

async function epicCtx(epicId: string) {
  const m = await getActiveMembership();
  if (!m?.orgId) return null;
  const e = (await db.select().from(epic).where(eq(epic.id, epicId)).limit(1))[0];
  if (!e || e.organizationId !== m.orgId) return null;
  const p = (await db.select().from(project).where(eq(project.id, e.projectId)).limit(1))[0];
  const canWork = canCreateProject(m.role) || p?.createdBy === m.userId;
  return { m, epic: e, canWork };
}

export async function updateEpic(epicId: string, patch: { name: string; scopeDetail: string; jiraId: string; jiraUrl: string }) {
  const ctx = await epicCtx(epicId);
  if (!ctx?.canWork) return { error: "Not allowed." };
  const n = patch.name?.trim();
  if (!n) return { error: "A name is required." };
  await db.update(epic).set({ name: n, scopeDetail: patch.scopeDetail?.trim() || null, jiraId: patch.jiraId?.trim() || null, jiraUrl: patch.jiraUrl?.trim() || null, updatedAt: new Date() }).where(eq(epic.id, epicId));
  return { ok: true };
}

export async function deleteEpic(epicId: string) {
  const ctx = await epicCtx(epicId);
  if (!ctx?.canWork) return { error: "Not allowed." };
  await db.delete(epic).where(eq(epic.id, epicId));
  return { ok: true };
}

export async function generateStories(epicId: string, model?: string) {
  const ctx = await epicCtx(epicId);
  if (!ctx?.canWork) return { error: "Not allowed." };
  const projectId = ctx.epic.projectId;

  const pb = await latestPlaybook(projectId);
  if (!pb) return { error: "Generate a product playbook first." };
  const p = (await db.select().from(project).where(eq(project.id, projectId)).limit(1))[0];
  const content = pb.content as PlaybookContent;
  const compliances = (await db.select({ label: projectCompliance.label }).from(projectCompliance).where(eq(projectCompliance.projectId, projectId))).map((c) => c.label);

  let draft;
  try {
    draft = await generateStoriesForEpic({
      orgId: ctx.m.orgId!,
      projectId,
      epic: { name: ctx.epic.name, scopeDetail: ctx.epic.scopeDetail },
      product: { projectName: p?.name ?? "", summary: content.projectSummary, hypothesis: content.keyHypothesis, projectType: content.projectType },
      compliances,
      model,
    });
  } catch (e) {
    if (e instanceof LLMConfigError) return { error: e.message };
    return { error: e instanceof Error ? `Generation failed: ${e.message}` : "Generation failed." };
  }

  const sourceApproved = pb.status === "approved";
  for (const [i, s] of draft.stories.entries()) {
    await db.insert(story).values({
      id: crypto.randomUUID(),
      organizationId: ctx.m.orgId!,
      projectId,
      epicId,
      title: s.title,
      userStory: s.userStory,
      acceptanceCriteria: s.acceptanceCriteria,
      priority: s.priority,
      points: s.points,
      status: "draft",
      citations: s.citations,
      sourcePlaybookId: pb.id,
      sourceVersion: draft.sourceVersion,
      sourceApproved,
      createdBy: ctx.m.userId,
    });
    void i;
  }

  await db.insert(aiGeneration).values({
    id: crypto.randomUUID(),
    organizationId: ctx.m.orgId!,
    projectId,
    epicId,
    playbookId: pb.id,
    kind: "stories",
    provider: draft.provider,
    model: draft.model,
    promptTokens: draft.promptTokens,
    completionTokens: draft.completionTokens,
    costUsdMicros: draft.costUsdMicros ?? null,
    groundedness: draft.groundedness,
    outcome: "generated",
    createdBy: ctx.m.userId,
  });

  await markTestPlanStale(projectId); // new stories → test coverage is behind
  return { ok: true, count: draft.stories.length, groundedness: draft.groundedness, sourceApproved };
}

async function storyCtx(storyId: string) {
  const m = await getActiveMembership();
  if (!m?.orgId) return null;
  const s = (await db.select().from(story).where(eq(story.id, storyId)).limit(1))[0];
  if (!s || s.organizationId !== m.orgId) return null;
  const p = (await db.select().from(project).where(eq(project.id, s.projectId)).limit(1))[0];
  const canWork = canCreateProject(m.role) || p?.createdBy === m.userId;
  return { m, story: s, canWork };
}

export async function updateStory(storyId: string, patch: { title: string; userStory: string; acceptanceCriteria: string[]; priority: string; points: number | null }) {
  const ctx = await storyCtx(storyId);
  if (!ctx?.canWork) return { error: "Not allowed." };
  if (!patch.title?.trim()) return { error: "A title is required." };
  await db.update(story).set({
    title: patch.title.trim(),
    userStory: patch.userStory?.trim() || null,
    acceptanceCriteria: patch.acceptanceCriteria.map((a) => a.trim()).filter(Boolean),
    priority: patch.priority || null,
    points: patch.points ?? null,
    updatedAt: new Date(),
  }).where(eq(story.id, storyId));
  await markTestPlanStale(ctx.story.projectId); // AC changed → test cases may be behind
  return { ok: true };
}

export async function deleteStory(storyId: string) {
  const ctx = await storyCtx(storyId);
  if (!ctx?.canWork) return { error: "Not allowed." };
  await db.delete(story).where(eq(story.id, storyId));
  await markTestPlanStale(ctx.story.projectId);
  return { ok: true };
}

export async function setStoryApproved(storyId: string, approved: boolean) {
  const ctx = await storyCtx(storyId);
  if (!ctx?.canWork) return { error: "Not allowed." };
  await db.update(story).set(approved ? { status: "approved", approvedBy: ctx.m.userId, approvedAt: new Date(), updatedAt: new Date() } : { status: "draft", approvedBy: null, approvedAt: null, updatedAt: new Date() }).where(eq(story.id, storyId));
  return { ok: true };
}

export async function assignStory(storyId: string, assigneeId: string | null) {
  const ctx = await storyCtx(storyId);
  if (!ctx?.canWork) return { error: "Not allowed." };
  if (assigneeId) {
    const pm = (await db.select({ id: projectMember.id }).from(projectMember).where(and(eq(projectMember.projectId, ctx.story.projectId), eq(projectMember.userId, assigneeId))).limit(1))[0];
    if (!pm) return { error: "Assignee must be a project member." };
  }
  await db.update(story).set({ assigneeId, updatedAt: new Date() }).where(eq(story.id, storyId));
  return { ok: true };
}

export async function setStoryDependencies(storyId: string, dependsOn: string[]) {
  const ctx = await storyCtx(storyId);
  if (!ctx?.canWork) return { error: "Not allowed." };
  const cleaned = Array.from(new Set((dependsOn || []).filter((d) => d && d !== storyId)));
  if (cleaned.length) {
    const valid = new Set((await db.select({ id: story.id }).from(story).where(eq(story.projectId, ctx.story.projectId))).map((r) => r.id));
    for (const d of cleaned) if (!valid.has(d)) return { error: "A dependency isn't in this project." };
  }
  await db.update(story).set({ dependsOn: cleaned, updatedAt: new Date() }).where(eq(story.id, storyId));
  return { ok: true };
}

/** Manual schedule pin (hybrid). Pass both dates to pin, or both null to clear (back to auto). */
export async function setStorySchedule(storyId: string, startDate: string | null, endDate: string | null) {
  const ctx = await storyCtx(storyId);
  if (!ctx?.canWork) return { error: "Not allowed." };
  if ((startDate && !endDate) || (!startDate && endDate)) return { error: "Set both start and end, or clear both to auto-schedule." };
  if (startDate && endDate && endDate < startDate) return { error: "End can't be before start." };
  await db.update(story).set({ startDate: startDate || null, endDate: endDate || null, updatedAt: new Date() }).where(eq(story.id, storyId));
  return { ok: true };
}
