"use server";

import { and, desc, eq } from "drizzle-orm";
import { getActiveMembership, canCreateProject, canManageOrg } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { techDoc, techDocApprover, playbook, feature, projectCompliance, aiGeneration, project, member } from "@/lib/db/schema";
import { generateTechDocDraft } from "@/lib/ai/generate";
import { LLMConfigError } from "@/lib/ai/provider";
import { TechDocContentSchema } from "@/lib/ai/techdoc";

type PlaybookContent = {
  projectSummary?: string;
  keyHypothesis?: string;
  projectType?: string;
  inScopeEpics?: Array<{ name: string; scopeDetail: string }>;
  kpis?: Array<{ metric: string; targetValue: string }>;
  operationalChangeManagement?: string;
};

async function loadProjectCtx(projectId: string) {
  const m = await getActiveMembership();
  if (!m?.orgId) return null;
  const p = (await db.select().from(project).where(eq(project.id, projectId)).limit(1))[0];
  if (!p || p.organizationId !== m.orgId) return null;
  const canWork = canCreateProject(m.role) || p.createdBy === m.userId;
  return { m, project: p, canWork };
}

async function latestTechDoc(projectId: string) {
  return (await db.select().from(techDoc).where(eq(techDoc.projectId, projectId)).orderBy(desc(techDoc.version)).limit(1))[0] ?? null;
}
async function latestPlaybook(projectId: string) {
  return (await db.select().from(playbook).where(eq(playbook.projectId, projectId)).orderBy(desc(playbook.version)).limit(1))[0] ?? null;
}

/** Upstream (playbook/features/compliance) changed → the tech doc no longer reflects the design. */
export async function markTechDocStale(projectId: string) {
  await db.update(techDoc).set({ stale: true }).where(eq(techDoc.projectId, projectId));
}

export async function generateTechDoc(projectId: string, model?: string) {
  const ctx = await loadProjectCtx(projectId);
  if (!ctx) return { error: "Not allowed." };
  if (!ctx.canWork) return { error: "You don't have permission to generate the tech doc." };

  const pb = await latestPlaybook(projectId);
  const pbContent = (pb?.content as PlaybookContent) ?? null;
  const playbookForPrompt = pbContent
    ? {
        summary: pbContent.projectSummary ?? "",
        hypothesis: pbContent.keyHypothesis ?? "",
        projectType: pbContent.projectType ?? "test",
        epics: (pbContent.inScopeEpics ?? []).map((e) => ({ name: e.name, scopeDetail: e.scopeDetail })),
        kpis: (pbContent.kpis ?? []).map((k) => ({ metric: k.metric, targetValue: k.targetValue })),
        operational: pbContent.operationalChangeManagement ?? "",
      }
    : null;

  const features = await db.select({ title: feature.title, brief: feature.brief }).from(feature).where(eq(feature.projectId, projectId)).orderBy(feature.createdAt);
  const compliances = await db.select({ label: projectCompliance.label }).from(projectCompliance).where(eq(projectCompliance.projectId, projectId));

  let draft;
  try {
    draft = await generateTechDocDraft({
      orgId: ctx.m.orgId!,
      projectId,
      project: { name: ctx.project.name, description: ctx.project.description },
      playbook: playbookForPrompt,
      features,
      compliances: compliances.map((c) => c.label),
      model,
    });
  } catch (e) {
    if (e instanceof LLMConfigError) return { error: e.message };
    return { error: e instanceof Error ? `Generation failed: ${e.message}` : "Generation failed." };
  }

  const prev = await latestTechDoc(projectId);
  const version = (prev?.version ?? 0) + 1;
  const techDocId = crypto.randomUUID();
  await db.insert(techDoc).values({
    id: techDocId,
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
    sourcePlaybookId: pb?.id ?? null,
    sourcePlaybookVersion: pb ? `v${pb.version}` : null,
    createdBy: ctx.m.userId,
  });

  if (prev) {
    const prevApprovers = await db.select({ userId: techDocApprover.userId }).from(techDocApprover).where(eq(techDocApprover.techDocId, prev.id));
    if (prevApprovers.length) {
      await db.insert(techDocApprover).values(prevApprovers.map((a) => ({ id: crypto.randomUUID(), techDocId, userId: a.userId, approvedAt: null })));
    }
  }

  await db.insert(aiGeneration).values({
    id: crypto.randomUUID(),
    organizationId: ctx.m.orgId!,
    projectId,
    playbookId: techDocId, // the artifact's own id, so the generation log can join it
    kind: "techdoc",
    provider: draft.provider,
    model: draft.model,
    promptTokens: draft.promptTokens,
    completionTokens: draft.completionTokens,
    costUsdMicros: draft.costUsdMicros ?? null,
    groundedness: draft.groundedness,
    outcome: "generated",
    createdBy: ctx.m.userId,
  });

  return { ok: true, techDocId, version, groundedness: draft.groundedness };
}

async function loadTechDocCtx(techDocId: string) {
  const m = await getActiveMembership();
  if (!m?.orgId) return null;
  const td = (await db.select().from(techDoc).where(eq(techDoc.id, techDocId)).limit(1))[0];
  if (!td || td.organizationId !== m.orgId) return null;
  const p = (await db.select().from(project).where(eq(project.id, td.projectId)).limit(1))[0];
  const canWork = canCreateProject(m.role) || p?.createdBy === m.userId;
  return { m, techDoc: td, canWork };
}

export async function saveTechDocContent(techDocId: string, content: unknown) {
  const ctx = await loadTechDocCtx(techDocId);
  if (!ctx) return { error: "Not allowed." };
  if (!ctx.canWork) return { error: "You don't have permission to edit this." };
  if (ctx.techDoc.status === "approved") return { error: "This tech doc is approved and locked." };
  const parsed = TechDocContentSchema.safeParse(content);
  if (!parsed.success) return { error: "Invalid tech doc content." };
  await db.update(techDoc).set({ content: parsed.data, edited: true, updatedAt: new Date() }).where(eq(techDoc.id, techDocId));
  return { ok: true };
}

export async function setTechDocApprovers(techDocId: string, userIds: string[]) {
  const ctx = await loadTechDocCtx(techDocId);
  if (!ctx) return { error: "Not allowed." };
  if (!ctx.canWork) return { error: "You don't have permission to set approvers." };

  const valid = new Set((await db.select({ userId: member.userId }).from(member).where(eq(member.organizationId, ctx.m.orgId!))).map((r) => r.userId));
  const want = Array.from(new Set(userIds.filter((u) => valid.has(u))));
  const existing = await db.select({ userId: techDocApprover.userId }).from(techDocApprover).where(eq(techDocApprover.techDocId, techDocId));
  const have = new Set(existing.map((e) => e.userId));

  for (const u of want) {
    if (!have.has(u)) await db.insert(techDocApprover).values({ id: crypto.randomUUID(), techDocId, userId: u, approvedAt: null }).onConflictDoNothing();
  }
  for (const e of existing) {
    if (!want.includes(e.userId)) await db.delete(techDocApprover).where(and(eq(techDocApprover.techDocId, techDocId), eq(techDocApprover.userId, e.userId)));
  }
  await recomputeApprovalStatus(techDocId);
  return { ok: true };
}

async function recomputeApprovalStatus(techDocId: string) {
  const rows = await db.select({ approvedAt: techDocApprover.approvedAt }).from(techDocApprover).where(eq(techDocApprover.techDocId, techDocId));
  const fullyApproved = rows.length > 0 && rows.every((r) => r.approvedAt != null);
  await db.update(techDoc).set({ status: fullyApproved ? "approved" : "draft", approvedAt: fullyApproved ? new Date() : null }).where(eq(techDoc.id, techDocId));
  return fullyApproved;
}

export async function approveTechDoc(techDocId: string) {
  const ctx = await loadTechDocCtx(techDocId);
  if (!ctx) return { error: "Not allowed." };

  const approvers = await db.select().from(techDocApprover).where(eq(techDocApprover.techDocId, techDocId));
  if (approvers.length === 0) {
    if (!ctx.canWork && !canManageOrg(ctx.m.role)) return { error: "Assign an approver, or ask a manager to approve." };
    await db.update(techDoc).set({ status: "approved", stale: false, approvedAt: new Date(), updatedAt: new Date() }).where(eq(techDoc.id, techDocId));
  } else {
    const mine = approvers.find((a) => a.userId === ctx.m.userId);
    if (!mine) return { error: "You're not an assigned approver for this tech doc." };
    if (!mine.approvedAt) await db.update(techDocApprover).set({ approvedAt: new Date() }).where(eq(techDocApprover.id, mine.id));
    await recomputeApprovalStatus(techDocId);
  }
  await db.update(aiGeneration).set({ outcome: ctx.techDoc.edited ? "edited" : "approved" }).where(and(eq(aiGeneration.playbookId, ctx.techDoc.id), eq(aiGeneration.outcome, "generated")));
  return { ok: true };
}
