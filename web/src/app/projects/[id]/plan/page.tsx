import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { getActiveMembership } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { project, projectMember, epic, story, user } from "@/lib/db/schema";
import { computePlan, budgetVerdict, timelineVerdict, type PlanStoryInput } from "@/lib/schedule";
import PlanClient from "./plan-client";

export default async function PlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const m = await getActiveMembership();
  if (!m) redirect("/login");

  const p = (await db.select().from(project).where(eq(project.id, id)).limit(1))[0];
  if (!p || p.organizationId !== m.orgId) notFound();

  const members = (await db
    .select({ userId: projectMember.userId, name: user.name, email: user.email, rate: projectMember.rate, hoursPerDay: projectMember.hoursPerDay })
    .from(projectMember)
    .innerJoin(user, eq(user.id, projectMember.userId))
    .where(eq(projectMember.projectId, id))).map((mm) => ({ userId: mm.userId, name: mm.name || mm.email, rate: mm.rate, hoursPerDay: mm.hoursPerDay }));

  const epics = await db.select({ id: epic.id, name: epic.name, orderIndex: epic.orderIndex }).from(epic).where(eq(epic.projectId, id)).orderBy(asc(epic.orderIndex));
  const epicMeta = new Map(epics.map((e, i) => [e.id, { order: e.orderIndex ?? i, name: e.name }]));

  const rows = await db
    .select({ id: story.id, epicId: story.epicId, title: story.title, points: story.points, priority: story.priority, status: story.status, assigneeId: story.assigneeId, startDate: story.startDate, endDate: story.endDate })
    .from(story)
    .where(eq(story.projectId, id));

  const planStories: PlanStoryInput[] = rows.map((s) => ({
    id: s.id,
    epicId: s.epicId,
    epicOrder: epicMeta.get(s.epicId)?.order ?? 0,
    epicName: epicMeta.get(s.epicId)?.name ?? "—",
    title: s.title,
    points: s.points,
    priority: s.priority,
    status: s.status,
    assigneeId: s.assigneeId,
    startDate: s.startDate,
    endDate: s.endDate,
  }));

  const plan = computePlan(
    { startDate: p.startDate, endDate: p.endDate, budget: p.budget, hoursPerPoint: p.hoursPerPoint },
    members.map((mm) => ({ userId: mm.userId, name: mm.name, rate: mm.rate, hoursPerDay: mm.hoursPerDay })),
    planStories,
  );
  const bv = budgetVerdict(plan, p.budget);
  const tv = timelineVerdict(plan, p.endDate);

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
        <h1 className="mt-3 text-2xl font-semibold">Plan &amp; schedule</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Story points × {p.hoursPerPoint}h = hours; scheduled per assignee against their capacity. Checked against your
          budget and expected dates.
        </p>
        <div className="mt-8">
          <PlanClient
            plan={plan}
            project={{ budget: p.budget, currency: p.currency, startDate: p.startDate, endDate: p.endDate, hoursPerPoint: p.hoursPerPoint }}
            budget={bv}
            timeline={tv}
          />
        </div>
      </div>
    </main>
  );
}
