import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { and, asc, desc, eq } from "drizzle-orm";
import { getActiveMembership, canCreateProject } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { project, epic, story, testPlan, testPlanApprover, testCase, testRun, testCredential, aiGeneration, member, user } from "@/lib/db/schema";
import { getConnector } from "@/lib/connectors";
import { currentProvider, MODEL_OPTIONS, defaultModel } from "@/lib/ai/provider";
import TestsWorkspace, { type TestCaseView, type TestPlanView, type StoryCoverage } from "./tests-client";

export default async function TestsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const m = await getActiveMembership();
  if (!m) redirect("/login");

  const p = (await db.select().from(project).where(eq(project.id, id)).limit(1))[0];
  if (!p || p.organizationId !== m.orgId) notFound();

  const plan = (await db.select().from(testPlan).where(eq(testPlan.projectId, id)).orderBy(desc(testPlan.version)).limit(1))[0] ?? null;

  const cases = plan
    ? await db.select().from(testCase).where(eq(testCase.testPlanId, plan.id)).orderBy(asc(testCase.orderIndex))
    : [];

  const members = await db
    .select({ userId: member.userId, name: user.name, email: user.email })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(eq(member.organizationId, m.orgId!));

  const approverRows = plan
    ? await db
        .select({ userId: testPlanApprover.userId, name: user.name, email: user.email, approvedAt: testPlanApprover.approvedAt })
        .from(testPlanApprover)
        .innerJoin(user, eq(user.id, testPlanApprover.userId))
        .where(eq(testPlanApprover.testPlanId, plan.id))
    : [];

  // coverage: every story vs. whether it has ≥1 case
  const epics = await db.select({ id: epic.id, name: epic.name, orderIndex: epic.orderIndex }).from(epic).where(eq(epic.projectId, id)).orderBy(asc(epic.orderIndex));
  const epicName = new Map(epics.map((e) => [e.id, e.name]));
  const storyRows = await db.select({ id: story.id, title: story.title, epicId: story.epicId }).from(story).where(eq(story.projectId, id)).orderBy(asc(story.createdAt));
  const coveredStoryIds = new Set(cases.map((c) => c.storyId).filter(Boolean) as string[]);
  const coverage: StoryCoverage[] = storyRows.map((s) => ({
    storyId: s.id,
    title: s.title,
    epicName: epicName.get(s.epicId) ?? "—",
    caseCount: cases.filter((c) => c.storyId === s.id).length,
    covered: coveredStoryIds.has(s.id),
  }));

  const gen = plan
    ? (await db.select({ prompt: aiGeneration.promptTokens, completion: aiGeneration.completionTokens, cost: aiGeneration.costUsdMicros }).from(aiGeneration).where(eq(aiGeneration.playbookId, plan.id)).orderBy(desc(aiGeneration.createdAt)).limit(1))[0] ?? null
    : null;

  const logRows = await db
    .select({ version: testPlan.version, createdAt: aiGeneration.createdAt, model: aiGeneration.model, provider: aiGeneration.provider, prompt: aiGeneration.promptTokens, completion: aiGeneration.completionTokens, cost: aiGeneration.costUsdMicros, groundedness: aiGeneration.groundedness, outcome: aiGeneration.outcome })
    .from(aiGeneration)
    .leftJoin(testPlan, eq(testPlan.id, aiGeneration.playbookId))
    .where(and(eq(aiGeneration.projectId, id), eq(aiGeneration.kind, "testcases")))
    .orderBy(desc(aiGeneration.createdAt));
  const generationLog = logRows.map((r) => ({
    version: r.version ?? null,
    at: r.createdAt.toISOString(),
    model: r.provider && r.model ? `${r.provider}/${r.model}` : r.model ?? "—",
    tokens: (r.prompt ?? 0) + (r.completion ?? 0),
    costUsdMicros: r.cost ?? null,
    groundedness: r.groundedness,
    outcome: r.outcome,
  }));

  const provider = currentProvider();
  const modelInfo = { provider, options: MODEL_OPTIONS[provider], defaultModel: defaultModel(provider) };
  const canWork = canCreateProject(m.role) || p.createdBy === m.userId;

  const planView: TestPlanView | null = plan
    ? {
        id: plan.id,
        version: plan.version,
        status: plan.status,
        stale: plan.stale,
        groundedness: plan.groundedness,
        provider: plan.provider,
        model: plan.model,
        edited: plan.edited,
        approvers: approverRows.map((a) => ({ userId: a.userId, name: a.name || a.email, approvedAt: a.approvedAt ? a.approvedAt.toISOString() : null })),
        tokens: gen ? (gen.prompt ?? 0) + (gen.completion ?? 0) : null,
        costUsdMicros: gen?.cost ?? null,
      }
    : null;

  // latest run status per case
  const runs = plan
    ? await db.select({ testCaseId: testRun.testCaseId, status: testRun.status }).from(testRun).where(eq(testRun.testPlanId, plan.id)).orderBy(desc(testRun.createdAt))
    : [];
  const lastRun = new Map<string, string>();
  for (const r of runs) if (r.testCaseId && !lastRun.has(r.testCaseId)) lastRun.set(r.testCaseId, r.status);

  const caseViews: TestCaseView[] = cases.map((c) => ({
    id: c.id,
    epicId: c.epicId,
    storyId: c.storyId,
    category: c.category,
    title: c.title,
    priority: c.priority,
    preconditions: c.preconditions,
    steps: (c.steps as string[]) ?? [],
    expectedResult: c.expectedResult,
    suites: (c.suites as string[]) ?? [],
    status: c.status,
    lastRunStatus: lastRun.get(c.id) ?? null,
  }));

  const epicList = epics.map((e) => ({ id: e.id, name: e.name }));
  const storyList = storyRows.map((s) => ({ id: s.id, title: s.title }));

  const credentials = (await db
    .select({ id: testCredential.id, name: testCredential.name, kind: testCredential.kind, username: testCredential.username, targetUrl: testCredential.targetUrl })
    .from(testCredential)
    .where(eq(testCredential.projectId, id))).map((c) => ({ ...c, hasSecret: true }));
  const bb = await getConnector(m.orgId!, "browserbase").catch(() => null);
  const browserbaseConnected = !!bb?.secret;

  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-900">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="font-semibold">Aurume</Link>
          <span className="text-sm text-neutral-500">{m.role}</span>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-6 py-10">
        <Link href={`/projects/${id}`} className="text-sm text-neutral-500 hover:text-neutral-900">← {p.name}</Link>
        <h1 className="mt-3 text-2xl font-semibold">Test cases</h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-500">
          Comprehensive test cases across categories, generated per epic and grounded in your stories&apos; acceptance criteria and the technical design. Tagged into suites (smoke / sanity / regression / e2e); the functional ones feed the testing engine.
        </p>
        <div className="mt-8">
          <TestsWorkspace
            projectId={id}
            plan={planView}
            cases={caseViews}
            coverage={coverage}
            epics={epicList}
            stories={storyList}
            members={members}
            canWork={canWork}
            meId={m.userId}
            modelInfo={modelInfo}
            generationLog={generationLog}
            credentials={credentials}
            browserbaseConnected={browserbaseConnected}
          />
        </div>
      </div>
    </main>
  );
}
