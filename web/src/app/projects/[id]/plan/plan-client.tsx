"use client";

import { useState } from "react";
import { dayDiff, parseISO, toISO, type Plan } from "@/lib/schedule";
import { formatBudget } from "@/lib/currencies";

type Verdict = { ok: boolean | null; unknown: boolean };
type BV = Verdict & { delta: number };
type TV = Verdict & { days: number };
type Proj = { budget: number | null; currency: string; startDate: string | null; endDate: string | null; hoursPerPoint: number };
type Member = { userId: string; name: string; role: string; hoursPerDay: number };

const PRI_BAR: Record<string, string> = { must: "bg-red-400", should: "bg-amber-400", could: "bg-blue-400", wont: "bg-neutral-400" };
const DAY_W = 32;
const LABEL_W = 210;

type Col = { iso: string; dom: number; month: number; year: number; monthLabel: string; week: number };

function buildColumns(startISO: string, endISO: string): Col[] {
  const cols: Col[] = [];
  let d = parseISO(startISO);
  const end = parseISO(endISO);
  let week = 0;
  let lastMonday = "";
  while (d.getTime() <= end.getTime()) {
    const g = d.getUTCDay();
    if (g !== 0 && g !== 6) {
      const monday = new Date(d);
      monday.setUTCDate(monday.getUTCDate() - ((g + 6) % 7));
      const mk = toISO(monday);
      if (mk !== lastMonday) { week++; lastMonday = mk; }
      cols.push({ iso: toISO(d), dom: d.getUTCDate(), month: d.getUTCMonth(), year: d.getUTCFullYear(), monthLabel: d.toLocaleDateString("en-US", { month: "long", timeZone: "UTC" }), week });
    }
    const n = new Date(d);
    n.setUTCDate(n.getUTCDate() + 1);
    d = n;
  }
  return cols;
}
/** Consecutive spans by a key → [{label, count, startIndex}]. */
function spans<T>(cols: Col[], key: (c: Col) => string, label: (c: Col) => string) {
  const out: { label: string; count: number; start: number }[] = [];
  cols.forEach((c, i) => {
    const k = key(c);
    const last = out[out.length - 1];
    if (last && key(cols[i - 1]) === k) last.count++;
    else out.push({ label: label(c), count: 1, start: i });
    void (last as T | undefined);
  });
  return out;
}

export default function PlanClient({ plan, project, members, budget, timeline }: { plan: Plan; project: Proj; members: Member[]; budget: BV; timeline: TV }) {
  const [view, setView] = useState<"role" | "epic">("role");
  const cur = project.currency;
  const money = (n: number | null) => (n == null ? "—" : formatBudget(Math.round(n), cur));

  const scheduled = plan.stories.filter((s) => s.start && s.end);
  const dates = scheduled.flatMap((s) => [s.start!, s.end!]);
  if (project.startDate) dates.push(project.startDate);
  const sorted = [...dates].sort();
  const rangeStart = sorted[0] ?? project.startDate ?? new Date().toISOString().slice(0, 10);
  let rangeEnd = sorted[sorted.length - 1] ?? rangeStart;
  // extend a little past the last bar for breathing room, and to fit the expected-end marker if close
  const cols = buildColumns(rangeStart, rangeEnd);
  const idxOfStart = (iso: string) => { const i = cols.findIndex((c) => c.iso >= iso.slice(0, 10)); return i < 0 ? cols.length - 1 : i; };
  const idxOfEnd = (iso: string) => { for (let i = cols.length - 1; i >= 0; i--) if (cols[i].iso <= iso.slice(0, 10)) return i; return 0; };
  const gridW = cols.length * DAY_W;
  const monthSpans = spans(cols, (c) => `${c.year}-${c.month}`, (c) => `${c.monthLabel} ${c.year}`);
  const weekSpans = spans(cols, (c) => String(c.week), (c) => `Week ${c.week}`);

  const expectedInRange = project.endDate && project.endDate >= rangeStart && project.endDate <= rangeEnd;
  const expectedLeft = expectedInRange ? (idxOfStart(project.endDate!) * DAY_W) : null;

  const hoursByUser = new Map(plan.perAssignee.map((a) => [a.userId, a.hours]));
  const capacity = (m: Member) => cols.length * m.hoursPerDay;
  const utilPct = (m: Member) => { const cap = capacity(m); return cap ? Math.round(((hoursByUser.get(m.userId) ?? 0) / cap) * 100) : 0; };
  const utilTone = (p: number) => (p > 100 ? "bg-red-100 text-red-700" : p >= 60 ? "bg-green-100 text-green-700" : p > 0 ? "bg-amber-100 text-amber-700" : "bg-neutral-100 text-neutral-400");

  // Global project utilization: total scheduled hours ÷ total team capacity over the window.
  const totalCapacity = members.reduce((a, m) => a + capacity(m), 0);
  const totalScheduledHours = plan.perAssignee.reduce((a, x) => a + x.hours, 0);
  const globalUtil = totalCapacity ? Math.round((totalScheduledHours / totalCapacity) * 100) : 0;
  const utilCardTone = totalCapacity === 0 ? "muted" : globalUtil > 100 ? "bad" : globalUtil >= 60 ? "ok" : "muted";

  function barsFor(userId: string) {
    return scheduled.filter((s) => s.assigneeId === userId).map((s) => ({ id: s.id, title: `${s.title}${s.points != null ? ` · ${s.points}pt` : ""}`, start: s.start!, end: s.end!, priority: s.priority, approved: s.status === "approved" }));
  }

  // group members by role
  const roleGroups = new Map<string, Member[]>();
  for (const m of members) { const arr = roleGroups.get(m.role) ?? []; arr.push(m); roleGroups.set(m.role, arr); }

  function Track({ bars }: { bars: { id: string; title: string; start: string; end: string; priority: string | null; approved: boolean }[] }) {
    return (
      <div className="relative h-7" style={{ width: gridW }}>
        {/* day gridlines */}
        {cols.map((c, i) => (
          <div key={c.iso} className={`absolute inset-y-0 border-l ${c.dom === 1 || i === 0 ? "border-neutral-300" : "border-neutral-100"}`} style={{ left: i * DAY_W, width: DAY_W }} />
        ))}
        {expectedLeft != null && <div className="absolute inset-y-0 z-10 w-px bg-red-400" style={{ left: expectedLeft }} title={`Expected end ${project.endDate}`} />}
        {bars.map((b) => {
          const l = idxOfStart(b.start) * DAY_W;
          const w = (idxOfEnd(b.end) - idxOfStart(b.start) + 1) * DAY_W;
          return (
            <div key={b.id} className={`absolute inset-y-1 z-20 flex items-center overflow-hidden rounded px-1.5 text-[10px] text-white ${b.priority ? PRI_BAR[b.priority] ?? "bg-neutral-500" : "bg-neutral-500"} ${b.approved ? "ring-1 ring-green-600" : ""}`} style={{ left: l + 1, width: Math.max(DAY_W - 2, w - 2) }} title={`${b.title} · ${b.start} → ${b.end}`}>
              <span className="truncate">{b.title}</span>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* verdict cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card title="Budget" tone={budget.unknown ? "muted" : budget.ok ? "ok" : "bad"} value={budget.unknown ? "—" : budget.ok ? "Within budget" : `Over by ${money(budget.delta)}`} sub={`Projected ${money(plan.totalCost)} · Budget ${money(project.budget)}`} />
        <Card title="Timeline" tone={timeline.unknown ? "muted" : timeline.ok ? "ok" : "bad"} value={timeline.unknown ? "—" : timeline.ok ? (timeline.days === 0 ? "On the deadline" : `${-timeline.days}d early`) : `Late by ${timeline.days}d`} sub={`Projected end ${plan.projectedEnd ?? "—"} · Expected ${project.endDate ?? "—"}`} />
        <Card title="Utilization" tone={utilCardTone} value={totalCapacity ? `${globalUtil}%` : "—"} sub={`${totalScheduledHours.toLocaleString()}h of ${totalCapacity.toLocaleString()}h capacity · ${members.length} member${members.length === 1 ? "" : "s"}`} />
        <Card title="Work" tone="muted" value={`${plan.totalHours.toLocaleString()} h`} sub={`${plan.stories.reduce((a, s) => a + (s.points ?? 0), 0)} pts · ${plan.stories.length} stories · ${project.hoursPerPoint}h/pt`} />
      </div>

      {(plan.flags.unassigned > 0 || plan.flags.unpointed > 0 || plan.flags.noRate > 0) && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {[plan.flags.unassigned ? `${plan.flags.unassigned} unassigned` : null, plan.flags.unpointed ? `${plan.flags.unpointed} without points` : null, plan.flags.noRate ? `${plan.flags.noRate} with no assignee rate` : null].filter(Boolean).join(" · ")}
          {" — these aren't scheduled or costed."}
        </p>
      )}

      {/* Gantt */}
      <div className="rounded-xl border border-neutral-200 bg-white">
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-3">
          <span className="text-sm font-medium">Schedule</span>
          <div className="flex gap-1 rounded-lg border border-neutral-200 p-0.5 text-xs">
            <button onClick={() => setView("role")} className={`rounded-md px-3 py-1 ${view === "role" ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-50"}`}>By role</button>
            <button onClick={() => setView("epic")} className={`rounded-md px-3 py-1 ${view === "epic" ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-50"}`}>By epic</button>
          </div>
        </div>

        {cols.length === 0 || (view === "epic" && scheduled.length === 0) ? (
          <p className="px-5 py-10 text-center text-sm text-neutral-400">Nothing scheduled yet. Give stories points and an assignee.</p>
        ) : (
          <div className="overflow-x-auto">
            <div style={{ minWidth: LABEL_W + gridW }}>
              {/* header: month / week / day */}
              <div className="flex border-b border-neutral-200 bg-neutral-50 text-[11px] text-neutral-500">
                <div className="sticky left-0 z-30 shrink-0 border-r border-neutral-200 bg-neutral-50" style={{ width: LABEL_W }} />
                <div className="relative" style={{ width: gridW }}>
                  <div className="flex">{monthSpans.map((s, i) => <div key={i} className="border-l border-neutral-200 px-2 py-0.5 font-medium text-neutral-700" style={{ width: s.count * DAY_W }}>{s.label}</div>)}</div>
                  <div className="flex">{weekSpans.map((s, i) => <div key={i} className="border-l border-neutral-200 px-2 py-0.5" style={{ width: s.count * DAY_W }}>{s.label}</div>)}</div>
                  <div className="flex">{cols.map((c, i) => <div key={c.iso} className={`border-l text-center ${c.dom === 1 || i === 0 ? "border-neutral-300" : "border-neutral-100"}`} style={{ width: DAY_W }}>{c.dom}</div>)}</div>
                </div>
              </div>

              {/* body */}
              {view === "role"
                ? [...roleGroups.entries()].map(([role, mem]) => {
                    const capSum = mem.reduce((a, m) => a + capacity(m), 0);
                    const hrsSum = mem.reduce((a, m) => a + (hoursByUser.get(m.userId) ?? 0), 0);
                    const rUtil = capSum ? Math.round((hrsSum / capSum) * 100) : 0;
                    return (
                      <div key={role}>
                        <div className="flex items-center border-b border-neutral-100 bg-neutral-50/70">
                          <div className="sticky left-0 z-20 flex shrink-0 items-center gap-2 border-r border-neutral-200 bg-neutral-50/70 px-4 py-2 text-sm font-semibold" style={{ width: LABEL_W }}>
                            {role}
                            <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${utilTone(rUtil)}`}>{rUtil}%</span>
                          </div>
                          <div style={{ width: gridW }} />
                        </div>
                        {mem.map((m) => {
                          const u = utilPct(m);
                          return (
                            <div key={m.userId} className="flex items-center border-b border-neutral-50 hover:bg-neutral-50/50">
                              <div className="sticky left-0 z-20 flex shrink-0 items-center justify-between gap-2 border-r border-neutral-200 bg-white px-4 py-1.5" style={{ width: LABEL_W }}>
                                <span className="truncate text-xs font-medium text-neutral-800" title={m.name}>{m.name}</span>
                                <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${utilTone(u)}`}>{u}%</span>
                              </div>
                              <Track bars={barsFor(m.userId)} />
                            </div>
                          );
                        })}
                      </div>
                    );
                  })
                : [...new Map(scheduled.map((s) => [s.epicName, true])).keys()].map((epicName) => (
                    <div key={epicName}>
                      <div className="flex items-center border-b border-neutral-100 bg-neutral-50/70">
                        <div className="sticky left-0 z-20 shrink-0 truncate border-r border-neutral-200 bg-neutral-50/70 px-4 py-2 text-sm font-semibold" style={{ width: LABEL_W }} title={epicName}>{epicName}</div>
                        <div style={{ width: gridW }} />
                      </div>
                      {scheduled.filter((s) => s.epicName === epicName).map((s) => (
                        <div key={s.id} className="flex items-center border-b border-neutral-50 hover:bg-neutral-50/50">
                          <div className="sticky left-0 z-20 shrink-0 truncate border-r border-neutral-200 bg-white px-4 py-1.5 text-xs text-neutral-700" style={{ width: LABEL_W }} title={s.title}>{s.title}</div>
                          <Track bars={[{ id: s.id, title: `${s.assigneeName ?? "—"}${s.points != null ? ` · ${s.points}pt` : ""}`, start: s.start!, end: s.end!, priority: s.priority, approved: s.status === "approved" }]} />
                        </div>
                      ))}
                    </div>
                  ))}
            </div>
          </div>
        )}
        <div className="flex flex-wrap gap-3 border-t border-neutral-100 px-5 py-2 text-[11px] text-neutral-400">
          <span className="flex items-center gap-1"><i className="inline-block h-2 w-2 rounded bg-red-400" />Must</span>
          <span className="flex items-center gap-1"><i className="inline-block h-2 w-2 rounded bg-amber-400" />Should</span>
          <span className="flex items-center gap-1"><i className="inline-block h-2 w-2 rounded bg-blue-400" />Could</span>
          <span className="flex items-center gap-1"><i className="inline-block h-2 w-2 rounded bg-neutral-400" />Won&apos;t</span>
          {expectedLeft != null && <span className="flex items-center gap-1"><i className="inline-block h-2.5 w-px bg-red-400" />Expected end</span>}
          <span>% = utilization over this window · Ring = approved</span>
          {project.endDate && !expectedInRange && <span>Expected end {project.endDate} is beyond the chart (well after the last task).</span>}
        </div>
      </div>

      {/* per-assignee cost table */}
      <div className="rounded-xl border border-neutral-200 bg-white">
        <div className="border-b border-neutral-200 px-5 py-3 text-sm font-medium">By assignee</div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead><tr className="border-b border-neutral-100 text-left text-[11px] uppercase tracking-wide text-neutral-400"><th className="px-4 py-2">Assignee</th><th className="px-4 py-2">Role</th><th className="px-4 py-2">Hours</th><th className="px-4 py-2">Cost</th><th className="px-4 py-2">Window</th></tr></thead>
            <tbody>
              {plan.perAssignee.length === 0 && <tr><td colSpan={5} className="px-4 py-4 text-neutral-400">No assigned work yet.</td></tr>}
              {plan.perAssignee.map((a) => (
                <tr key={a.userId ?? a.name} className="border-b border-neutral-50">
                  <td className="px-4 py-2">{a.name}</td>
                  <td className="px-4 py-2 text-neutral-500">{members.find((m) => m.userId === a.userId)?.role ?? "—"}</td>
                  <td className="px-4 py-2">{a.hours.toLocaleString()} h</td>
                  <td className="px-4 py-2">{money(a.cost)}</td>
                  <td className="px-4 py-2 text-neutral-500">{a.start && a.end ? `${a.start} → ${a.end}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Card({ title, value, sub, tone }: { title: string; value: string; sub: string; tone: "ok" | "bad" | "muted" }) {
  const ring = tone === "ok" ? "border-green-200" : tone === "bad" ? "border-red-200" : "border-neutral-200";
  const vc = tone === "ok" ? "text-green-700" : tone === "bad" ? "text-red-700" : "text-neutral-900";
  return (
    <div className={`rounded-xl border ${ring} bg-white p-4`}>
      <div className="text-xs uppercase tracking-wide text-neutral-400">{title}</div>
      <div className={`mt-1 text-xl font-semibold ${vc}`}>{value}</div>
      <div className="mt-0.5 text-xs text-neutral-400">{sub}</div>
    </div>
  );
}
