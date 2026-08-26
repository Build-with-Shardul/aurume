"use server";

import { and, eq } from "drizzle-orm";
import { getActiveMembership, canCreateProject } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { feature, playbook, aiGeneration, project } from "@/lib/db/schema";
import { generatePlaybookDraft } from "@/lib/ai/generate";
import { LLMConfigError } from "@/lib/ai/provider";
import { PlaybookContentSchema } from "@/lib/ai/playbook";

/** Load a project the caller may work in, plus whether they can create/generate. */
async function loadProjectCtx(projectId: string) {
  const m = await getActiveMembership();
  if (!m?.orgId) return null;
  const p = (await db.select().from(project).where(eq(project.id, projectId)).limit(1))[0];
  if (!p || p.organizationId !== m.orgId) return null;
  const canWork = canCreateProject(m.role) || p.createdBy === m.userId;
  return { m, project: p, canWork };
}

async function loadFeatureCtx(featureId: string) {
  const m = await getActiveMembership();
  if (!m?.orgId) return null;
  const f = (await db.select().from(feature).where(eq(feature.id, featureId)).limit(1))[0];
  if (!f || f.organizationId !== m.orgId) return null;
  const p = (await db.select().from(project).where(eq(project.id, f.projectId)).limit(1))[0];
  const canWork = canCreateProject(m.role) || p?.createdBy === m.userId;
  return { m, feature: f, project: p, canWork };
}

export async function createFeature(projectId: string, title: string, brief: string) {
  const ctx = await loadProjectCtx(projectId);
  if (!ctx) return { error: "Not allowed." };
  if (!ctx.canWork) return { error: "You don't have permission to add features." };
  const t = title?.trim();
  if (!t) return { error: "A title is required." };
  const id = crypto.randomUUID();
  await db.insert(feature).values({
    id,
    organizationId: ctx.m.orgId!,
    projectId,
    title: t,
    brief: brief?.trim() || null,
    createdBy: ctx.m.userId,
  });
  return { ok: true, id };
}

export async function generatePlaybook(featureId: string) {
  const ctx = await loadFeatureCtx(featureId);
  if (!ctx?.project) return { error: "Not allowed." };
  if (!ctx.canWork) return { error: "You don't have permission to generate playbooks." };

  let draft;
  try {
    draft = await generatePlaybookDraft({
      orgId: ctx.m.orgId!,
      projectId: ctx.feature.projectId,
      feature: { title: ctx.feature.title, brief: ctx.feature.brief },
    });
  } catch (e) {
    if (e instanceof LLMConfigError) return { error: e.message };
    return { error: e instanceof Error ? `Generation failed: ${e.message}` : "Generation failed." };
  }

  const existing = await db.select({ v: playbook.version }).from(playbook).where(eq(playbook.featureId, featureId));
  const version = existing.length + 1;

  const playbookId = crypto.randomUUID();
  await db.insert(playbook).values({
    id: playbookId,
    organizationId: ctx.m.orgId!,
    featureId,
    version,
    status: "draft",
    content: draft.content,
    groundedness: draft.groundedness,
    provider: draft.provider,
    model: draft.model,
    sourceVersion: draft.sourceVersion,
    sourceKnowledge: draft.sourceKnowledge,
    createdBy: ctx.m.userId,
  });

  await db.insert(aiGeneration).values({
    id: crypto.randomUUID(),
    organizationId: ctx.m.orgId!,
    projectId: ctx.feature.projectId,
    featureId,
    playbookId,
    kind: "playbook",
    provider: draft.provider,
    model: draft.model,
    promptTokens: draft.promptTokens,
    completionTokens: draft.completionTokens,
    costUsdMicros: draft.costUsdMicros ?? null,
    latencyMs: null,
    groundedness: draft.groundedness,
    outcome: "generated",
    createdBy: ctx.m.userId,
  });

  return { ok: true, playbookId, version, groundedness: draft.groundedness, knowledgeCount: draft.knowledgeCount };
}

async function loadPlaybookCtx(playbookId: string) {
  const m = await getActiveMembership();
  if (!m?.orgId) return null;
  const pb = (await db.select().from(playbook).where(eq(playbook.id, playbookId)).limit(1))[0];
  if (!pb || pb.organizationId !== m.orgId) return null;
  const f = (await db.select().from(feature).where(eq(feature.id, pb.featureId)).limit(1))[0];
  const p = f ? (await db.select().from(project).where(eq(project.id, f.projectId)).limit(1))[0] : undefined;
  const canWork = canCreateProject(m.role) || p?.createdBy === m.userId;
  return { m, playbook: pb, canWork };
}

export async function savePlaybookContent(playbookId: string, content: unknown) {
  const ctx = await loadPlaybookCtx(playbookId);
  if (!ctx) return { error: "Not allowed." };
  if (!ctx.canWork) return { error: "You don't have permission to edit this." };
  if (ctx.playbook.status === "approved") return { error: "This playbook is approved and locked." };
  const parsed = PlaybookContentSchema.safeParse(content);
  if (!parsed.success) return { error: "Invalid playbook content." };
  await db
    .update(playbook)
    .set({ content: parsed.data, edited: true, updatedAt: new Date() })
    .where(eq(playbook.id, playbookId));
  return { ok: true };
}

export async function approvePlaybook(playbookId: string) {
  const ctx = await loadPlaybookCtx(playbookId);
  if (!ctx) return { error: "Not allowed." };
  if (!ctx.canWork) return { error: "You don't have permission to approve." };
  await db
    .update(playbook)
    .set({ status: "approved", approvedBy: ctx.m.userId, approvedAt: new Date(), updatedAt: new Date() })
    .where(eq(playbook.id, playbookId));
  // Record the human outcome for the acceptance metric.
  await db
    .update(aiGeneration)
    .set({ outcome: ctx.playbook.edited ? "edited" : "approved" })
    .where(and(eq(aiGeneration.playbookId, playbookId), eq(aiGeneration.outcome, "generated")));
  return { ok: true };
}
