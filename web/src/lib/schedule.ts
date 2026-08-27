// Pure scheduling + costing engine for the project plan / Gantt. No DB, no side effects.
// Hybrid scheduling: stories with manual start+end are pinned; the rest are
// auto-scheduled per assignee, back-to-back from the project start, using each
// member's hours/day capacity and skipping weekends.

export type PlanMember = { userId: string; name: string; rate: number | null; hoursPerDay: number };
export type PlanStoryInput = {
  id: string;
  epicId: string;
  epicOrder: number;
  epicName: string;
  title: string;
  points: number | null;
  priority: string | null;
  status: string;
  assigneeId: string | null;
  startDate: string | null; // manual pin
  endDate: string | null;
};

export type ScheduledStory = {
  id: string;
  epicId: string;
  epicName: string;
  title: string;
  points: number | null;
  priority: string | null;
  status: string;
  assigneeId: string | null;
  assigneeName: string | null;
  hours: number;
  cost: number | null;
  start: string | null; // ISO date
  end: string | null;
  pinned: boolean;
};

export type Plan = {
  hoursPerPoint: number;
  stories: ScheduledStory[];
  projectedStart: string | null;
  projectedEnd: string | null;
  totalHours: number;
  totalCost: number | null; // null if nothing costable
  costableAll: boolean; // true if every scheduled story had a rate
  perAssignee: Array<{ userId: string | null; name: string; hours: number; cost: number | null; start: string | null; end: string | null }>;
  perEpic: Array<{ epicId: string; name: string; points: number; hours: number; cost: number | null; storyCount: number }>;
  flags: { unassigned: number; unpointed: number; noRate: number };
};

const PRI_RANK: Record<string, number> = { must: 0, should: 1, could: 2, wont: 3 };

function parseISO(s: string): Date {
  return new Date(`${s.slice(0, 10)}T00:00:00Z`);
}
function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function isWeekend(d: Date): boolean {
  const g = d.getUTCDay();
  return g === 0 || g === 6;
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}
/** First day at/after d that isn't "off" (weekend or leave). */
function nextAvailable(d: Date, isOff: (x: Date) => boolean): Date {
  let r = new Date(d);
  while (isOff(r)) r = addDays(r, 1);
  return r;
}
/** Advance n available days from an available day d (n>=0; n=0 returns d). */
function addAvailableDays(d: Date, n: number, isOff: (x: Date) => boolean): Date {
  let r = new Date(d);
  let left = n;
  while (left > 0) {
    r = addDays(r, 1);
    if (!isOff(r)) left--;
  }
  return r;
}
/** Expand leave ranges for a user into a Set of ISO day strings. */
function leaveSetFor(leaves: Array<{ userId: string; start: string; end: string }>, userId: string): Set<string> {
  const set = new Set<string>();
  for (const l of leaves) {
    if (l.userId !== userId) continue;
    let d = parseISO(l.start);
    const end = parseISO(l.end);
    while (d.getTime() <= end.getTime()) {
      set.add(toISO(d));
      d = addDays(d, 1);
    }
  }
  return set;
}
/** Inclusive count of calendar days between two ISO dates (b - a). */
function dayDiff(aISO: string, bISO: string): number {
  return Math.round((parseISO(bISO).getTime() - parseISO(aISO).getTime()) / 86400000);
}

export function computePlan(
  project: { startDate: string | null; endDate: string | null; budget: number | null; hoursPerPoint: number },
  members: PlanMember[],
  stories: PlanStoryInput[],
  leaves: Array<{ userId: string; start: string; end: string }> = [],
): Plan {
  const hpp = project.hoursPerPoint || 8;
  const memberById = new Map(members.map((m) => [m.userId, m]));
  const leaveSets = new Map(members.map((m) => [m.userId, leaveSetFor(leaves, m.userId)]));
  const offFor = (userId: string) => (x: Date) => isWeekend(x) || (leaveSets.get(userId)?.has(toISO(x)) ?? false);
  const anchorRaw = project.startDate ? parseISO(project.startDate) : new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);

  const scheduled: ScheduledStory[] = stories.map((s) => {
    const mem = s.assigneeId ? memberById.get(s.assigneeId) ?? null : null;
    const hours = (s.points ?? 0) * hpp;
    const cost = mem && mem.rate != null && s.points != null ? hours * mem.rate : null;
    return {
      id: s.id, epicId: s.epicId, epicName: s.epicName, title: s.title, points: s.points, priority: s.priority,
      status: s.status, assigneeId: s.assigneeId, assigneeName: mem?.name ?? null,
      hours, cost, start: null, end: null, pinned: !!(s.startDate && s.endDate),
    };
  });
  const byId = new Map(scheduled.map((s) => [s.id, s]));

  // Pin manual-dated stories.
  for (const s of stories) {
    if (s.startDate && s.endDate) {
      const sc = byId.get(s.id)!;
      sc.start = s.startDate.slice(0, 10);
      sc.end = s.endDate.slice(0, 10);
    }
  }

  // Auto-schedule the rest, per assignee.
  const order = (a: PlanStoryInput, b: PlanStoryInput) =>
    a.epicOrder - b.epicOrder || (PRI_RANK[a.priority ?? "should"] ?? 1) - (PRI_RANK[b.priority ?? "should"] ?? 1) || a.title.localeCompare(b.title);
  const autoByAssignee = new Map<string, PlanStoryInput[]>();
  for (const s of stories) {
    if (!s.assigneeId || s.points == null || s.points <= 0) continue; // unassigned/unpointed → not scheduled
    if (s.startDate && s.endDate) continue; // pinned
    const arr = autoByAssignee.get(s.assigneeId) ?? [];
    arr.push(s);
    autoByAssignee.set(s.assigneeId, arr);
  }
  for (const [assigneeId, arr] of autoByAssignee) {
    const mem = memberById.get(assigneeId);
    const perDay = Math.max(1, mem?.hoursPerDay ?? 8);
    const isOff = offFor(assigneeId);
    arr.sort(order);
    let cursor = nextAvailable(anchorRaw, isOff);
    for (const s of arr) {
      const sc = byId.get(s.id)!;
      const days = Math.max(1, Math.ceil(sc.hours / perDay));
      const start = cursor;
      const end = addAvailableDays(start, days - 1, isOff);
      sc.start = toISO(start);
      sc.end = toISO(end);
      cursor = nextAvailable(addDays(end, 1), isOff);
    }
  }

  // Roll-ups.
  const dated = scheduled.filter((s) => s.start && s.end);
  const projectedStart = dated.length ? dated.map((s) => s.start!).sort()[0] : project.startDate;
  const projectedEnd = dated.length ? dated.map((s) => s.end!).sort().slice(-1)[0] : null;
  const totalHours = scheduled.reduce((a, s) => a + s.hours, 0);
  const costs = scheduled.filter((s) => s.cost != null);
  const totalCost = costs.length ? costs.reduce((a, s) => a + (s.cost ?? 0), 0) : null;
  const costableAll = scheduled.every((s) => s.points == null || s.points <= 0 || s.cost != null);

  const perAssignee = members.map((m) => {
    const mine = scheduled.filter((s) => s.assigneeId === m.userId);
    const ends = mine.filter((s) => s.end).map((s) => s.end!);
    const starts = mine.filter((s) => s.start).map((s) => s.start!);
    const c = mine.filter((s) => s.cost != null);
    return {
      userId: m.userId, name: m.name,
      hours: mine.reduce((a, s) => a + s.hours, 0),
      cost: c.length ? c.reduce((a, s) => a + (s.cost ?? 0), 0) : null,
      start: starts.length ? starts.sort()[0] : null,
      end: ends.length ? ends.sort().slice(-1)[0] : null,
    };
  }).filter((a) => a.hours > 0 || scheduled.some((s) => s.assigneeId === a.userId));

  const epicMap = new Map<string, { epicId: string; name: string; points: number; hours: number; cost: number | null; storyCount: number }>();
  for (const s of scheduled) {
    const cur = epicMap.get(s.epicId) ?? { epicId: s.epicId, name: s.epicName, points: 0, hours: 0, cost: 0 as number | null, storyCount: 0 };
    cur.points += s.points ?? 0;
    cur.hours += s.hours;
    cur.cost = s.cost != null ? (cur.cost ?? 0) + s.cost : cur.cost;
    cur.storyCount++;
    epicMap.set(s.epicId, cur);
  }

  return {
    hoursPerPoint: hpp,
    stories: scheduled,
    projectedStart,
    projectedEnd,
    totalHours,
    totalCost,
    costableAll,
    perAssignee,
    perEpic: [...epicMap.values()],
    flags: {
      unassigned: scheduled.filter((s) => !s.assigneeId).length,
      unpointed: scheduled.filter((s) => s.points == null || s.points <= 0).length,
      noRate: scheduled.filter((s) => s.assigneeId && (memberById.get(s.assigneeId)?.rate == null)).length,
    },
  };
}

/** Verdict helpers for the dashboard. */
export function budgetVerdict(plan: Plan, budget: number | null) {
  if (budget == null || plan.totalCost == null) return { ok: true as boolean | null, delta: 0, unknown: true };
  const delta = plan.totalCost - budget;
  return { ok: delta <= 0, delta, unknown: false };
}
export function timelineVerdict(plan: Plan, expectedEnd: string | null) {
  if (!expectedEnd || !plan.projectedEnd) return { ok: true as boolean | null, days: 0, unknown: true };
  const days = dayDiff(expectedEnd, plan.projectedEnd); // >0 = late
  return { ok: days <= 0, days, unknown: false };
}
export { dayDiff, parseISO, toISO };
