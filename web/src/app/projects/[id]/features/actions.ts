"use server";

import { and, desc, eq } from "drizzle-orm";
import { getActiveMembership, canCreateProject, canManageOrg } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { feature, playbook, playbookApprover, aiGeneration, project, member, user, projectCompliance } from "@/lib/db/schema";
import { generateProductPlaybookDraft } from "@/lib/ai/generate";
import { LLMConfigError } from "@/lib/ai/provider";
import { PlaybookContentSchema } from "@/lib/ai/playbook";
import { markTechDocStale } from "../tdd/actions";

async function loadProjectCtx(projectId: string) {
  const m = await getActiveMembership();
  if (!m?.orgId) return null;
  const p = (await db.select().from(project).where(eq(project.id, projectId)).limit(1))[0];
  if (!p || p.organizationId !== m.orgId) return null;
  const canWork = canCreateProject(m.role) || p.createdBy === m.userId;
  return { m, project: p, canWork };
}

/** The project's single (latest-version) product playbook, if any. */
async function latestPlaybook(projectId: string) {
  return (
    (await db.select().from(playbook).where(eq(playbook.projectId, projectId)).orderBy(desc(playbook.version)).limit(1))[0] ??
    null
  );
}

/** Features changed → the product playbook no longer reflects the project. */
async function markPlaybookStale(projectId: string) {
  await db.update(playbook).set({ stale: true }).where(eq(playbook.projectId, projectId));
  // The tech doc grounds on the playbook + features, so the same changes stale it too.
  await markTechDocStale(projectId);
}

export async function createFeature(projectId: string, title: string, brief: string) {
  const ctx = await loadProjectCtx(projectId);
  if (!ctx) return { error: "Not allowed." };
  if (!ctx.canWork) return { error: "You don't have permission to add features." };
  const t = title?.trim();
  if (!t) return { error: "A title is required." };
  await db.insert(feature).values({
    id: crypto.randomUUID(),
    organizationId: ctx.m.orgId!,
    projectId,
    title: t,
    brief: brief?.trim() || null,
    createdBy: ctx.m.userId,
  });
  await markPlaybookStale(projectId);
  return { ok: true };
}

export async function setCompliance(projectId: string, key: string, label: string, on: boolean) {
  const ctx = await loadProjectCtx(projectId);
  if (!ctx) return { error: "Not allowed." };
  if (!ctx.canWork) return { error: "You don't have permission to change compliance." };
  const k = key?.trim();
  const l = label?.trim();
  if (!k || !l) return { error: "Invalid compliance." };
  if (on) {
    await db
      .insert(projectCompliance)
      .values({ id: crypto.randomUUID(), organizationId: ctx.m.orgId!, projectId, key: k, label: l, createdBy: ctx.m.userId })
      .onConflictDoNothing();
  } else {
    await db.delete(projectCompliance).where(and(eq(projectCompliance.projectId, projectId), eq(projectCompliance.key, k)));
  }
  await markPlaybookStale(projectId);
  return { ok: true };
}

export async function updateFeature(featureId: string, title: string, brief: string) {
  const m = await getActiveMembership();
  if (!m?.orgId) return { error: "Not allowed." };
  const f = (await db.select().from(feature).where(eq(feature.id, featureId)).limit(1))[0];
  if (!f || f.organizationId !== m.orgId) return { error: "Not found." };
  const ctx = await loadProjectCtx(f.projectId);
  if (!ctx?.canWork) return { error: "You don't have permission to edit features." };
  const t = title?.trim();
  if (!t) return { error: "A title is required." };
  await db.update(feature).set({ title: t, brief: brief?.trim() || null, updatedAt: new Date() }).where(eq(feature.id, featureId));
  await markPlaybookStale(f.projectId);
  return { ok: true };
}

export async function deleteFeature(featureId: string) {
  const m = await getActiveMembership();
  if (!m?.orgId) return { error: "Not allowed." };
  const f = (await db.select().from(feature).where(eq(feature.id, featureId)).limit(1))[0];
  if (!f || f.organizationId !== m.orgId) return { error: "Not found." };
  const ctx = await loadProjectCtx(f.projectId);
  if (!ctx?.canWork) return { error: "You don't have permission to remove features." };
  await db.delete(feature).where(eq(feature.id, featureId));
  await markPlaybookStale(f.projectId);
  return { ok: true };
}

export async function generateProductPlaybook(projectId: string, model?: string) {
  const ctx = await loadProjectCtx(projectId);
  if (!ctx) return { error: "Not allowed." };
  if (!ctx.canWork) return { error: "You don't have permission to generate the playbook." };

  const features = await db
    .select({ title: feature.title, brief: feature.brief })
    .from(feature)
    .where(eq(feature.projectId, projectId))
    .orderBy(feature.createdAt);

  const members = await db
    .select({ name: user.name, email: user.email, discipline: member.discipline })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(eq(member.organizationId, ctx.m.orgId!));

  const compliances = await db
    .select({ label: projectCompliance.label })
    .from(projectCompliance)
    .where(eq(projectCompliance.projectId, projectId));

  let draft;
  try {
    draft = await generateProductPlaybookDraft({
      orgId: ctx.m.orgId!,
      projectId,
      project: { name: ctx.project.name, description: ctx.project.description },
      features,
      members: members.map((mem) => ({ name: mem.name || mem.email, discipline: mem.discipline })),
      compliances: compliances.map((c) => c.label),
      model,
    });
  } catch (e) {
    if (e instanceof LLMConfigError) return { error: e.message };
    return { error: e instanceof Error ? `Generation failed: ${e.message}` : "Generation failed." };
  }

  const prev = await latestPlaybook(projectId);
  const version = (prev?.version ?? 0) + 1;
  const playbookId = crypto.randomUUID();
  await db.insert(playbook).values({
    id: playbookId,
    organizationId: ctx.m.orgId!,
    projectId,
    version,
    status: "draft",
    stale: false,
    content: draft.content,
    groundedness: draft.groundedness,
    provider: draft.provider,
    model: draft.model,
    sourceVersion: draft.sourceVersion,
    sourceKnowledge: draft.sourceKnowledge,
    createdBy: ctx.m.userId,
  });

  // Carry the assigned approver set forward to the new version (reset to pending).
  if (prev) {
    const prevApprovers = await db.select({ userId: playbookApprover.userId }).from(playbookApprover).where(eq(playbookApprover.playbookId, prev.id));
    if (prevApprovers.length) {
      await db.insert(playbookApprover).values(
        prevApprovers.map((a) => ({ id: crypto.randomUUID(), playbookId, userId: a.userId, approvedAt: null })),
      );
    }
  }

  await db.insert(aiGeneration).values({
    id: crypto.randomUUID(),
    organizationId: ctx.m.orgId!,
    projectId,
    playbookId,
    kind: "playbook",
    provider: draft.provider,
    model: draft.model,
    promptTokens: draft.promptTokens,
    completionTokens: draft.completionTokens,
    costUsdMicros: draft.costUsdMicros ?? null,
    groundedness: draft.groundedness,
    outcome: "generated",
    createdBy: ctx.m.userId,
  });

  await markTechDocStale(projectId); // a new playbook version means the tech doc is behind

  return { ok: true, playbookId, version, groundedness: draft.groundedness };
}

async function loadPlaybookCtx(playbookId: string) {
  const m = await getActiveMembership();
  if (!m?.orgId) return null;
  const pb = (await db.select().from(playbook).where(eq(playbook.id, playbookId)).limit(1))[0];
  if (!pb || pb.organizationId !== m.orgId) return null;
  const p = (await db.select().from(project).where(eq(project.id, pb.projectId)).limit(1))[0];
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
  await db.update(playbook).set({ content: parsed.data, edited: true, updatedAt: new Date() }).where(eq(playbook.id, playbookId));
  await markTechDocStale(ctx.playbook.projectId); // playbook edited → tech doc is behind
  return { ok: true };
}

/** Replace the assigned approver set for a playbook (multiple allowed). Keeps existing approvals for retained approvers. */
export async function setApprovers(playbookId: string, userIds: string[]) {
  const ctx = await loadPlaybookCtx(playbookId);
  if (!ctx) return { error: "Not allowed." };
  if (!ctx.canWork) return { error: "You don't have permission to set approvers." };

  const valid = new Set(
    (await db.select({ userId: member.userId }).from(member).where(eq(member.organizationId, ctx.m.orgId!))).map((r) => r.userId),
  );
  const want = Array.from(new Set(userIds.filter((u) => valid.has(u))));

  const existing = await db.select({ userId: playbookApprover.userId }).from(playbookApprover).where(eq(playbookApprover.playbookId, playbookId));
  const have = new Set(existing.map((e) => e.userId));

  for (const u of want) {
    if (!have.has(u)) {
      await db.insert(playbookApprover).values({ id: crypto.randomUUID(), playbookId, userId: u, approvedAt: null }).onConflictDoNothing();
    }
  }
  for (const e of existing) {
    if (!want.includes(e.userId)) {
      await db.delete(playbookApprover).where(and(eq(playbookApprover.playbookId, playbookId), eq(playbookApprover.userId, e.userId)));
    }
  }
  // Changing the approver set means it's not fully approved unless everyone remaining has approved.
  await recomputeApprovalStatus(playbookId);
  return { ok: true };
}

/** Set the playbook approved (or not) based on whether every assigned approver has approved. */
async function recomputeApprovalStatus(playbookId: string) {
  const rows = await db.select({ approvedAt: playbookApprover.approvedAt }).from(playbookApprover).where(eq(playbookApprover.playbookId, playbookId));
  const fullyApproved = rows.length > 0 && rows.every((r) => r.approvedAt != null);
  await db
    .update(playbook)
    .set({ status: fullyApproved ? "approved" : "draft", approvedAt: fullyApproved ? new Date() : null })
    .where(eq(playbook.id, playbookId));
  return fullyApproved;
}

export async function approvePlaybook(playbookId: string) {
  const ctx = await loadPlaybookCtx(playbookId);
  if (!ctx) return { error: "Not allowed." };

  const approvers = await db.select().from(playbookApprover).where(eq(playbookApprover.playbookId, playbookId));

  if (approvers.length === 0) {
    // No approvers assigned — a project manager may approve directly.
    if (!ctx.canWork && !canManageOrg(ctx.m.role)) return { error: "Assign an approver, or ask a manager to approve." };
    await db.update(playbook).set({ status: "approved", stale: false, approvedAt: new Date(), updatedAt: new Date() }).where(eq(playbook.id, playbookId));
  } else {
    const mine = approvers.find((a) => a.userId === ctx.m.userId);
    if (!mine) return { error: "You're not an assigned approver for this playbook." };
    if (!mine.approvedAt) {
      await db.update(playbookApprover).set({ approvedAt: new Date() }).where(eq(playbookApprover.id, mine.id));
    }
    await recomputeApprovalStatus(playbookId);
  }

  await db.update(aiGeneration).set({ outcome: ctx.playbook.edited ? "edited" : "approved" }).where(and(eq(aiGeneration.playbookId, playbookId), eq(aiGeneration.outcome, "generated")));
  return { ok: true };
}
