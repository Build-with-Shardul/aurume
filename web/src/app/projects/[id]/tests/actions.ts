"use server";

import { and, asc, desc, eq } from "drizzle-orm";
import { getActiveMembership, canCreateProject, canManageOrg } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { project, epic, story, techDoc, projectCompliance, testPlan, testPlanApprover, testCase, aiGeneration, member } from "@/lib/db/schema";
import { generateTestCasesForStories } from "@/lib/ai/generate";
import { LLMConfigError } from "@/lib/ai/provider";

type TddContent = { architectureOverview?: string; apis?: Array<{ method: string; path: string; purpose: string }>; securityPrivacy?: string };

async function loadProjectCtx(projectId: string) {
  const m = await getActiveMembership();
  if (!m?.orgId) return null;
  const p = (await db.select().from(project).where(eq(project.id, projectId)).limit(1))[0];
  if (!p || p.organizationId !== m.orgId) return null;
  const canWork = canCreateProject(m.role) || p.createdBy === m.userId;
  return { m, project: p, canWork };
}

async function latestPlan(projectId: string) {
  return (await db.select().from(testPlan).where(eq(testPlan.projectId, projectId)).orderBy(desc(testPlan.version)).limit(1))[0] ?? null;
}

/** Upstream (stories/TDD/playbook) changed → the test plan no longer reflects them. */
export async function markTestPlanStale(projectId: string) {
  await db.update(testPlan).set({ stale: true }).where(eq(testPlan.projectId, projectId));
}

async function tddContext(projectId: string) {
  const td = (await db.select({ content: techDoc.content }).from(techDoc).where(eq(techDoc.projectId, projectId)).orderBy(desc(techDoc.version)).limit(1))[0];
  if (!td) return null;
  const c = td.content as TddContent;
  return {
    architecture: c.architectureOverview,
    apisSummary: (c.apis ?? []).map((a) => `${a.method} ${a.path} — ${a.purpose}`).join("; ") || undefined,
    security: c.securityPrivacy,
  };
}

async function complianceLabels(projectId: string) {
  return (await db.select({ label: projectCompliance.label }).from(projectCompliance).where(eq(projectCompliance.projectId, projectId))).map((c) => c.label);
}

async function storiesForEpic(epicId: string) {
  const rows = await db
    .select({ id: story.id, title: story.title, userStory: story.userStory, acceptanceCriteria: story.acceptanceCriteria })
    .from(story)
    .where(eq(story.epicId, epicId))
    .orderBy(asc(story.createdAt));
  return rows.map((s, i) => ({ ref: `S${i + 1}`, id: s.id, title: s.title, userStory: s.userStory, acceptanceCriteria: (s.acceptanceCriteria as string[]) ?? [] }));
}

/** Get the current plan, or create v1 (draft). Used by incremental epic/story generation. */
async function ensurePlan(ctx: NonNullable<Awaited<ReturnType<typeof loadProjectCtx>>>): Promise<string> {
  const existing = await latestPlan(ctx.project.id);
  if (existing) return existing.id;
  const id = crypto.randomUUID();
  await db.insert(testPlan).values({ id, organizationId: ctx.m.orgId!, projectId: ctx.project.id, version: 1, status: "draft", createdBy: ctx.m.userId });
  return id;
}

type GenStory = { ref: string; id: string; title: string; userStory: string | null; acceptanceCriteria: string[] };

/** Insert generated cases into a plan, mapping storyRef → storyId. */
async function insertCases(opts: {
  orgId: string;
  projectId: string;
  planId: string;
  epicId: string | null;
  stories: GenStory[];
  cases: Awaited<ReturnType<typeof generateTestCasesForStories>>["cases"];
  createdBy: string;
  baseOrder: number;
}) {
  const byRef = new Map(opts.stories.map((s) => [s.ref, s.id]));
  let i = opts.baseOrder;
  for (const c of opts.cases) {
    await db.insert(testCase).values({
      id: crypto.randomUUID(),
      organizationId: opts.orgId,
      projectId: opts.projectId,
      testPlanId: opts.planId,
      epicId: opts.epicId,
      storyId: c.storyRef ? byRef.get(c.storyRef) ?? null : null,
      category: c.category,
      title: c.title,
      priority: c.priority,
      preconditions: c.preconditions?.trim() || null,
      steps: c.steps ?? [],
      expectedResult: c.expectedResult?.trim() || null,
      suites: c.suites ?? [],
      status: "draft",
      orderIndex: i++,
      createdBy: opts.createdBy,
    });
  }
}

async function logGeneration(opts: { orgId: string; projectId: string; planId: string; draft: Awaited<ReturnType<typeof generateTestCasesForStories>>; createdBy: string }) {
  await db.insert(aiGeneration).values({
    id: crypto.randomUUID(),
    organizationId: opts.orgId,
    projectId: opts.projectId,
    playbookId: opts.planId, // artifact's own id, so the generation log can join it
    kind: "testcases",
    provider: opts.draft.provider,
    model: opts.draft.model,
    promptTokens: opts.draft.promptTokens,
    completionTokens: opts.draft.completionTokens,
    costUsdMicros: opts.draft.costUsdMicros ?? null,
    groundedness: opts.draft.groundedness,
    outcome: "generated",
    createdBy: opts.createdBy,
  });
}

const STORY_BATCH = 3; // stories per LLM call — keeps structured output within the token budget

type EpicTotals = { generated: number; prompt: number; completion: number; cost: number; costKnown: boolean; groundednessSum: number; batches: number; provider: string; model: string; sourceVersion: string; sourceKnowledge: Array<{ id: string; updatedAt: string }> };

/** Generate + insert cases for one epic, in small story-batches so no single response is truncated. */
async function genEpicCases(opts: {
  ctx: NonNullable<Awaited<ReturnType<typeof loadProjectCtx>>>;
  projectId: string; planId: string; epicId: string; epicName: string;
  tdd: Awaited<ReturnType<typeof tddContext>>; compliances: string[]; model?: string; startOrder: number;
}): Promise<EpicTotals> {
  const all = await storiesForEpic(opts.epicId);
  const batches: GenStory[][] = all.length ? [] : [[]];
  for (let i = 0; i < all.length; i += STORY_BATCH) batches.push(all.slice(i, i + STORY_BATCH));

  const t: EpicTotals = { generated: 0, prompt: 0, completion: 0, cost: 0, costKnown: false, groundednessSum: 0, batches: 0, provider: "", model: "", sourceVersion: "", sourceKnowledge: [] };
  let order = opts.startOrder;
  for (const raw of batches) {
    const batch = raw.map((s, j) => ({ ...s, ref: `S${j + 1}` })); // refs are per-batch
    const draft = await generateTestCasesForStories({
      orgId: opts.ctx.m.orgId!, projectId: opts.projectId,
      scope: { projectName: opts.ctx.project.name, epicName: opts.epicName },
      stories: batch, tdd: opts.tdd, compliances: opts.compliances, model: opts.model,
    });
    await insertCases({ orgId: opts.ctx.m.orgId!, projectId: opts.projectId, planId: opts.planId, epicId: opts.epicId, stories: batch, cases: draft.cases, createdBy: opts.ctx.m.userId, baseOrder: order });
    order += draft.cases.length;
    t.generated += draft.cases.length; t.prompt += draft.promptTokens; t.completion += draft.completionTokens;
    if (draft.costUsdMicros != null) { t.cost += draft.costUsdMicros; t.costKnown = true; }
    t.groundednessSum += draft.groundedness; t.batches++;
    t.provider = draft.provider; t.model = draft.model; t.sourceVersion = draft.sourceVersion; t.sourceKnowledge = draft.sourceKnowledge;
  }
  return t;
}

/** Full corpus: new plan version, generate per epic, assemble. */
export async function generateProjectTestCases(projectId: string, model?: string) {
  const ctx = await loadProjectCtx(projectId);
  if (!ctx) return { error: "Not allowed." };
  if (!ctx.canWork) return { error: "You don't have permission." };

  const epics = await db.select({ id: epic.id, name: epic.name }).from(epic).where(eq(epic.projectId, projectId)).orderBy(asc(epic.orderIndex));
  if (!epics.length) return { error: "Add epics & stories first — test cases are generated per epic." };

  const tdd = await tddContext(projectId);
  const compliances = await complianceLabels(projectId);

  const prev = await latestPlan(projectId);
  const version = (prev?.version ?? 0) + 1;
  const planId = crypto.randomUUID();
  await db.insert(testPlan).values({ id: planId, organizationId: ctx.m.orgId!, projectId, version, status: "draft", createdBy: ctx.m.userId });

  if (prev) {
    const prevApprovers = await db.select({ userId: testPlanApprover.userId }).from(testPlanApprover).where(eq(testPlanApprover.testPlanId, prev.id));
    if (prevApprovers.length) await db.insert(testPlanApprover).values(prevApprovers.map((a) => ({ id: crypto.randomUUID(), testPlanId: planId, userId: a.userId, approvedAt: null })));
  }

  let order = 0;
  let totalPrompt = 0, totalCompletion = 0, totalCost = 0, costKnown = false;
  let groundednessSum = 0, groundedCount = 0;
  let provider = "", model2 = "", sourceVersion = "";
  let sourceKnowledge: Array<{ id: string; updatedAt: string }> = [];
  let generated = 0;

  for (const e of epics) {
    let t;
    try {
      t = await genEpicCases({ ctx, projectId, planId, epicId: e.id, epicName: e.name, tdd, compliances, model, startOrder: order });
    } catch (err) {
      if (err instanceof LLMConfigError) return { error: err.message };
      return { error: err instanceof Error ? `Generation failed on epic "${e.name}": ${err.message}` : "Generation failed." };
    }
    order += t.generated;
    generated += t.generated;
    totalPrompt += t.prompt; totalCompletion += t.completion;
    if (t.costKnown) { totalCost += t.cost; costKnown = true; }
    groundednessSum += t.groundednessSum; groundedCount += t.batches;
    if (t.provider) { provider = t.provider; model2 = t.model; sourceVersion = t.sourceVersion; sourceKnowledge = t.sourceKnowledge; }
  }

  const groundedness = groundedCount ? Math.round(groundednessSum / groundedCount) : 0;
  await db.update(testPlan).set({ groundedness, provider, model: model2, sourceVersion, sourceKnowledge, stale: false }).where(eq(testPlan.id, planId));
  await db.insert(aiGeneration).values({
    id: crypto.randomUUID(), organizationId: ctx.m.orgId!, projectId, playbookId: planId, kind: "testcases",
    provider, model: model2, promptTokens: totalPrompt, completionTokens: totalCompletion, costUsdMicros: costKnown ? totalCost : null,
    groundedness, outcome: "generated", createdBy: ctx.m.userId,
  });

  return { ok: true, planId, version, count: generated, groundedness };
}

/** Incremental: regenerate cases for one epic within the current plan (replace that epic's cases). */
export async function generateEpicTestCases(projectId: string, epicId: string, model?: string) {
  const ctx = await loadProjectCtx(projectId);
  if (!ctx?.canWork) return { error: "Not allowed." };
  const e = (await db.select({ id: epic.id, name: epic.name }).from(epic).where(and(eq(epic.id, epicId), eq(epic.projectId, projectId))).limit(1))[0];
  if (!e) return { error: "Epic not found." };
  const stories = await storiesForEpic(epicId);
  if (!stories.length) return { error: "This epic has no stories to test yet." };

  const planId = await ensurePlan(ctx);
  const tdd = await tddContext(projectId);
  const compliances = await complianceLabels(projectId);

  await db.delete(testCase).where(and(eq(testCase.testPlanId, planId), eq(testCase.epicId, epicId)));
  const baseOrder = (await db.select({ id: testCase.id }).from(testCase).where(eq(testCase.testPlanId, planId))).length;

  let t;
  try {
    t = await genEpicCases({ ctx, projectId, planId, epicId, epicName: e.name, tdd, compliances, model, startOrder: baseOrder });
  } catch (err) {
    if (err instanceof LLMConfigError) return { error: err.message };
    return { error: err instanceof Error ? `Generation failed: ${err.message}` : "Generation failed." };
  }
  const groundedness = t.batches ? Math.round(t.groundednessSum / t.batches) : 0;
  await db.update(testPlan).set({ edited: true, updatedAt: new Date() }).where(eq(testPlan.id, planId));
  await db.insert(aiGeneration).values({ id: crypto.randomUUID(), organizationId: ctx.m.orgId!, projectId, playbookId: planId, kind: "testcases", provider: t.provider, model: t.model, promptTokens: t.prompt, completionTokens: t.completion, costUsdMicros: t.costKnown ? t.cost : null, groundedness, outcome: "generated", createdBy: ctx.m.userId });
  return { ok: true, count: t.generated, groundedness };
}

/** Incremental: (re)generate cases for a single story within the current plan. */
export async function generateStoryTestCases(projectId: string, storyId: string, model?: string) {
  const ctx = await loadProjectCtx(projectId);
  if (!ctx?.canWork) return { error: "Not allowed." };
  const s = (await db.select().from(story).where(and(eq(story.id, storyId), eq(story.projectId, projectId))).limit(1))[0];
  if (!s) return { error: "Story not found." };
  const genStory: GenStory = { ref: "S1", id: s.id, title: s.title, userStory: s.userStory, acceptanceCriteria: (s.acceptanceCriteria as string[]) ?? [] };

  const planId = await ensurePlan(ctx);
  const tdd = await tddContext(projectId);
  const compliances = await complianceLabels(projectId);

  let draft;
  try {
    draft = await generateTestCasesForStories({ orgId: ctx.m.orgId!, projectId, scope: { projectName: ctx.project.name }, stories: [genStory], tdd, compliances, model });
  } catch (err) {
    if (err instanceof LLMConfigError) return { error: err.message };
    return { error: err instanceof Error ? `Generation failed: ${err.message}` : "Generation failed." };
  }

  await db.delete(testCase).where(and(eq(testCase.testPlanId, planId), eq(testCase.storyId, storyId)));
  const baseOrder = (await db.select({ id: testCase.id }).from(testCase).where(eq(testCase.testPlanId, planId))).length;
  await insertCases({ orgId: ctx.m.orgId!, projectId, planId, epicId: s.epicId, stories: [genStory], cases: draft.cases, createdBy: ctx.m.userId, baseOrder });
  await db.update(testPlan).set({ edited: true, updatedAt: new Date() }).where(eq(testPlan.id, planId));
  await logGeneration({ orgId: ctx.m.orgId!, projectId, planId, draft, createdBy: ctx.m.userId });
  return { ok: true, count: draft.cases.length, groundedness: draft.groundedness };
}

// ---- case + plan mutations ----

async function caseCtx(caseId: string) {
  const m = await getActiveMembership();
  if (!m?.orgId) return null;
  const tc = (await db.select().from(testCase).where(eq(testCase.id, caseId)).limit(1))[0];
  if (!tc || tc.organizationId !== m.orgId) return null;
  const p = (await db.select().from(project).where(eq(project.id, tc.projectId)).limit(1))[0];
  const canWork = canCreateProject(m.role) || p?.createdBy === m.userId;
  return { m, testCase: tc, canWork };
}

export async function updateTestCase(caseId: string, patch: { title: string; category: string; priority: string; preconditions: string; steps: string[]; expectedResult: string; suites: string[] }) {
  const ctx = await caseCtx(caseId);
  if (!ctx?.canWork) return { error: "Not allowed." };
  if (!patch.title?.trim()) return { error: "A title is required." };
  await db.update(testCase).set({
    title: patch.title.trim(),
    category: patch.category,
    priority: patch.priority,
    preconditions: patch.preconditions?.trim() || null,
    steps: patch.steps.map((s) => s.trim()).filter(Boolean),
    expectedResult: patch.expectedResult?.trim() || null,
    suites: patch.suites,
    updatedAt: new Date(),
  }).where(eq(testCase.id, caseId));
  return { ok: true };
}

export async function setTestCaseStatus(caseId: string, approved: boolean) {
  const ctx = await caseCtx(caseId);
  if (!ctx?.canWork) return { error: "Not allowed." };
  await db.update(testCase).set({ status: approved ? "approved" : "draft", updatedAt: new Date() }).where(eq(testCase.id, caseId));
  return { ok: true };
}

export async function deleteTestCase(caseId: string) {
  const ctx = await caseCtx(caseId);
  if (!ctx?.canWork) return { error: "Not allowed." };
  await db.delete(testCase).where(eq(testCase.id, caseId));
  return { ok: true };
}

async function planCtx(planId: string) {
  const m = await getActiveMembership();
  if (!m?.orgId) return null;
  const pl = (await db.select().from(testPlan).where(eq(testPlan.id, planId)).limit(1))[0];
  if (!pl || pl.organizationId !== m.orgId) return null;
  const p = (await db.select().from(project).where(eq(project.id, pl.projectId)).limit(1))[0];
  const canWork = canCreateProject(m.role) || p?.createdBy === m.userId;
  return { m, plan: pl, canWork };
}

export async function setTestPlanApprovers(planId: string, userIds: string[]) {
  const ctx = await planCtx(planId);
  if (!ctx?.canWork) return { error: "Not allowed." };
  const valid = new Set((await db.select({ userId: member.userId }).from(member).where(eq(member.organizationId, ctx.m.orgId!))).map((r) => r.userId));
  const want = Array.from(new Set(userIds.filter((u) => valid.has(u))));
  const existing = await db.select({ userId: testPlanApprover.userId }).from(testPlanApprover).where(eq(testPlanApprover.testPlanId, planId));
  const have = new Set(existing.map((e) => e.userId));
  for (const u of want) if (!have.has(u)) await db.insert(testPlanApprover).values({ id: crypto.randomUUID(), testPlanId: planId, userId: u, approvedAt: null }).onConflictDoNothing();
  for (const e of existing) if (!want.includes(e.userId)) await db.delete(testPlanApprover).where(and(eq(testPlanApprover.testPlanId, planId), eq(testPlanApprover.userId, e.userId)));
  await recompute(planId);
  return { ok: true };
}

async function recompute(planId: string) {
  const rows = await db.select({ approvedAt: testPlanApprover.approvedAt }).from(testPlanApprover).where(eq(testPlanApprover.testPlanId, planId));
  const full = rows.length > 0 && rows.every((r) => r.approvedAt != null);
  await db.update(testPlan).set({ status: full ? "approved" : "draft", approvedAt: full ? new Date() : null }).where(eq(testPlan.id, planId));
  if (full) await db.update(testCase).set({ status: "approved" }).where(eq(testCase.testPlanId, planId));
  return full;
}

export async function approveTestPlan(planId: string) {
  const ctx = await planCtx(planId);
  if (!ctx) return { error: "Not allowed." };
  const approvers = await db.select().from(testPlanApprover).where(eq(testPlanApprover.testPlanId, planId));
  if (approvers.length === 0) {
    if (!ctx.canWork && !canManageOrg(ctx.m.role)) return { error: "Assign an approver, or ask a manager to approve." };
    await db.update(testPlan).set({ status: "approved", stale: false, approvedAt: new Date(), updatedAt: new Date() }).where(eq(testPlan.id, planId));
    await db.update(testCase).set({ status: "approved" }).where(eq(testCase.testPlanId, planId));
  } else {
    const mine = approvers.find((a) => a.userId === ctx.m.userId);
    if (!mine) return { error: "You're not an assigned approver for this test plan." };
    if (!mine.approvedAt) await db.update(testPlanApprover).set({ approvedAt: new Date() }).where(eq(testPlanApprover.id, mine.id));
    await recompute(planId);
  }
  await db.update(aiGeneration).set({ outcome: ctx.plan.edited ? "edited" : "approved" }).where(and(eq(aiGeneration.playbookId, planId), eq(aiGeneration.outcome, "generated")));
  return { ok: true };
}
