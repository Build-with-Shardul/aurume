import { NextRequest, NextResponse } from "next/server";
import { and, asc, desc, eq } from "drizzle-orm";
import { getActiveMembership } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { project, story, testPlan, testPlanApprover, testCase, aiGeneration, user } from "@/lib/db/schema";
import { buildTestCasesDocx, buildTestCasesPdf, type TestCasesDocData, type ExportCase } from "@/lib/testcases-export";

export const runtime = "nodejs";

const CATEGORIES: [string, string][] = [
  ["happy", "Happy path"], ["edge", "Edge cases"], ["negative", "Negative / error"], ["api", "API"],
  ["ui", "UI"], ["performance", "Performance"], ["security", "Security"], ["accessibility", "Accessibility"],
];

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const format = (req.nextUrl.searchParams.get("format") || "pdf").toLowerCase();
  if (format !== "pdf" && format !== "docx") return NextResponse.json({ error: "format must be pdf or docx" }, { status: 400 });

  const m = await getActiveMembership();
  if (!m?.orgId) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const p = (await db.select().from(project).where(eq(project.id, id)).limit(1))[0];
  if (!p || p.organizationId !== m.orgId) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const plan = (await db.select().from(testPlan).where(eq(testPlan.projectId, id)).orderBy(desc(testPlan.version)).limit(1))[0];
  if (!plan) return NextResponse.json({ error: "No test cases to download yet." }, { status: 404 });

  const cases = await db.select().from(testCase).where(eq(testCase.testPlanId, plan.id)).orderBy(asc(testCase.orderIndex));
  const storyRows = await db.select({ id: story.id, title: story.title }).from(story).where(eq(story.projectId, id));
  const storyTitle = new Map(storyRows.map((s) => [s.id, s.title]));
  const totalStories = storyRows.length;
  const coveredStories = new Set(cases.map((c) => c.storyId).filter(Boolean) as string[]).size;

  const approvers = await db
    .select({ name: user.name, email: user.email, approvedAt: testPlanApprover.approvedAt })
    .from(testPlanApprover)
    .innerJoin(user, eq(user.id, testPlanApprover.userId))
    .where(eq(testPlanApprover.testPlanId, plan.id));

  const gen = (await db.select({ prompt: aiGeneration.promptTokens, completion: aiGeneration.completionTokens }).from(aiGeneration).where(and(eq(aiGeneration.playbookId, plan.id), eq(aiGeneration.kind, "testcases"))).orderBy(desc(aiGeneration.createdAt)).limit(1))[0];

  const categories = CATEGORIES.map(([key, label]) => ({
    label,
    cases: cases.filter((c) => c.category === key).map<ExportCase>((c) => ({
      title: c.title,
      priority: c.priority,
      suites: (c.suites as string[]) ?? [],
      preconditions: c.preconditions,
      steps: (c.steps as string[]) ?? [],
      expectedResult: c.expectedResult,
      storyTitle: c.storyId ? storyTitle.get(c.storyId) : undefined,
    })),
  })).filter((c) => c.cases.length);

  const data: TestCasesDocData = {
    projectName: p.name,
    version: plan.version,
    status: plan.status,
    provider: plan.provider,
    model: plan.model,
    groundedness: plan.groundedness,
    tokens: gen ? (gen.prompt ?? 0) + (gen.completion ?? 0) : null,
    generatedAt: plan.createdAt,
    coverage: { covered: coveredStories, total: totalStories },
    approvers: approvers.map((a) => ({ name: a.name || a.email, approvedAt: a.approvedAt })),
    categories,
  };

  const safeName = p.name.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "test-cases";
  const filename = `TestCases-${safeName}-v${plan.version}.${format}`;
  const buf = format === "docx" ? await buildTestCasesDocx(data) : await buildTestCasesPdf(data);
  const contentType = format === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "application/pdf";
  return new NextResponse(new Uint8Array(buf), { headers: { "Content-Type": contentType, "Content-Disposition": `attachment; filename="${filename}"`, "Content-Length": String(buf.length) } });
}
