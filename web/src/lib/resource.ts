import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "./db";
import { project, projectMember, epic, story, leave, user } from "./db/schema";
import { computePlan, type PlanStoryInput } from "./schedule";

function weekdaysBetween(startISO: string, endISO: string): string[] {
  const out: string[] = [];
  let d = new Date(`${startISO.slice(0, 10)}T00:00:00Z`);
  const end = new Date(`${endISO.slice(0, 10)}T00:00:00Z`);
  while (d.getTime() <= end.getTime()) {
    const g = d.getUTCDay();
    if (g !== 0 && g !== 6) out.push(d.toISOString().slice(0, 10));
    d = new Date(d);
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export type ResourceProject = {
  projectId: string;
  name: string;
  currency: string;
  rate: number | null;
  hoursPerDay: number;
  hours: number;
  cost: number | null;
  start: string | null;
  end: string | null;
  storyCount: number;
  stories: Array<{ id: string; title: string; epicName: string; start: string; end: string }>;
};
export type ResourceAllocation = {
  projects: ResourceProject[];
  months: Array<{ month: string; label: string; byProject: Record<string, number>; total: number }>;
  totalHours: number;
  totalCost: number | null;
  currency: string;
};

/** Aggregate a user's scheduled work across every project they're on (each project scheduled independently). */
export async function getResourceAllocation(orgId: string, userId: string): Promise<ResourceAllocation> {
  const projs = await db
    .select({ projectId: project.id, name: project.name, currency: project.currency, startDate: project.startDate, endDate: project.endDate, budget: project.budget, hoursPerPoint: project.hoursPerPoint, rate: projectMember.rate, hoursPerDay: projectMember.hoursPerDay })
    .from(projectMember)
    .innerJoin(project, eq(project.id, projectMember.projectId))
    .where(and(eq(projectMember.userId, userId), eq(project.organizationId, orgId)))
    .orderBy(asc(project.name));

  const orgLeaves = await db.select({ userId: leave.userId, start: leave.startDate, end: leave.endDate }).from(leave).where(eq(leave.organizationId, orgId));

  const out: ResourceProject[] = [];
  const monthMap = new Map<string, { byProject: Record<string, number>; total: number }>();
  let totalHours = 0;
  let totalCost: number | null = null;
  const currency = projs[0]?.currency ?? "USD";

  for (const pr of projs) {
    const members = await db
      .select({ userId: projectMember.userId, name: user.name, email: user.email, rate: projectMember.rate, hoursPerDay: projectMember.hoursPerDay })
      .from(projectMember)
      .innerJoin(user, eq(user.id, projectMember.userId))
      .where(eq(projectMember.projectId, pr.projectId));
    const epics = await db.select({ id: epic.id, name: epic.name, orderIndex: epic.orderIndex }).from(epic).where(eq(epic.projectId, pr.projectId)).orderBy(asc(epic.orderIndex));
    const epicMeta = new Map(epics.map((e, i) => [e.id, { order: e.orderIndex ?? i, name: e.name }]));
    const rows = await db
      .select({ id: story.id, epicId: story.epicId, title: story.title, points: story.points, priority: story.priority, status: story.status, assigneeId: story.assigneeId, dependsOn: story.dependsOn, startDate: story.startDate, endDate: story.endDate })
      .from(story)
      .where(eq(story.projectId, pr.projectId));

    const planStories: PlanStoryInput[] = rows.map((s) => ({
      id: s.id, epicId: s.epicId, epicOrder: epicMeta.get(s.epicId)?.order ?? 0, epicName: epicMeta.get(s.epicId)?.name ?? "—",
      title: s.title, points: s.points, priority: s.priority, status: s.status, assigneeId: s.assigneeId, dependsOn: (s.dependsOn as string[]) ?? [], startDate: s.startDate, endDate: s.endDate,
    }));
    const plan = computePlan(
      { startDate: pr.startDate, endDate: pr.endDate, budget: pr.budget, hoursPerPoint: pr.hoursPerPoint },
      members.map((mm) => ({ userId: mm.userId, name: mm.name || mm.email, rate: mm.rate, hoursPerDay: mm.hoursPerDay })),
      planStories,
      orgLeaves,
    );
    const mine = plan.stories.filter((s) => s.assigneeId === userId && s.start && s.end);
    const hours = mine.reduce((a, s) => a + s.hours, 0);
    const costs = mine.filter((s) => s.cost != null);
    const cost = costs.length ? costs.reduce((a, s) => a + (s.cost ?? 0), 0) : null;
    const starts = mine.map((s) => s.start!).sort();
    const ends = mine.map((s) => s.end!).sort();

    out.push({
      projectId: pr.projectId, name: pr.name, currency: pr.currency, rate: pr.rate, hoursPerDay: pr.hoursPerDay,
      hours, cost, start: starts[0] ?? null, end: ends[ends.length - 1] ?? null, storyCount: mine.length,
      stories: mine.map((s) => ({ id: s.id, title: s.title, epicName: s.epicName, start: s.start!, end: s.end! })),
    });

    totalHours += hours;
    if (cost != null) totalCost = (totalCost ?? 0) + cost;

    // monthly allocation: distribute each story's hours across its weekdays
    for (const s of mine) {
      const days = weekdaysBetween(s.start!, s.end!);
      if (!days.length) continue;
      const perDay = s.hours / days.length;
      for (const day of days) {
        const mk = day.slice(0, 7); // YYYY-MM
        const cur = monthMap.get(mk) ?? { byProject: {}, total: 0 };
        cur.byProject[pr.projectId] = (cur.byProject[pr.projectId] ?? 0) + perDay;
        cur.total += perDay;
        monthMap.set(mk, cur);
      }
    }
  }

  const months = [...monthMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([mk, v]) => ({
      month: mk,
      label: new Date(`${mk}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }),
      byProject: Object.fromEntries(Object.entries(v.byProject).map(([k, h]) => [k, Math.round(h)])),
      total: Math.round(v.total),
    }));

  return { projects: out, months, totalHours, totalCost, currency };
}
