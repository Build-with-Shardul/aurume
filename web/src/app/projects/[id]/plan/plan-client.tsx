"use client";

import { useState } from "react";
import { dayDiff, type Plan } from "@/lib/schedule";
import { formatBudget } from "@/lib/currencies";

type Verdict = { ok: boolean | null; unknown: boolean };
type BV = Verdict & { delta: number };
type TV = Verdict & { days: number };
type Proj = { budget: number | null; currency: string; startDate: string | null; endDate: string | null; hoursPerPoint: number };

const PRI_BAR: Record<string, string> = { must: "bg-red-400", should: "bg-amber-400", could: "bg-blue-400", wont: "bg-neutral-400" };

export default function PlanClient({ plan, project, budget, timeline }: { plan: Plan; project: Proj; budget: BV; timeline: TV }) {
  const [view, setView] = useState<"assignee" | "epic">("assignee");
  const cur = project.currency;
  const money = (n: number | null) => (n == null ? "—" : formatBudget(Math.round(n), cur));

  const scheduled = plan.stories.filter((s) => s.start && s.end);
  const dates = scheduled.flatMap((s) => [s.start!, s.end!]);
  if (project.startDate) dates.push(project.startDate);
  if (project.endDate) dates.push(project.endDate);
  const sorted = [...dates].sort();
  const rangeStart = sorted[0] ?? project.startDate ?? new Date().toISOString().slice(0, 10);
  const rangeEnd = sorted[sorted.length - 1] ?? rangeStart;
  const totalDays = Math.max(1, dayDiff(rangeStart, rangeEnd) + 1);
  const pct = (fromISO: string) => (dayDiff(rangeStart, fromISO) / totalDays) * 100;
  const barGeom = (startISO: string, endISO: string) => ({ left: `${pct(startISO)}%`, width: `${((dayDiff(startISO, endISO) + 1) / totalDays) * 100}%` });
  const expectedMarker = project.endDate ? pct(project.endDate) : null;

  const notScheduled = plan.stories.filter((s) => !s.start);

  // rows: by assignee (one row each, sequential bars) OR by epic (one row per story)
  type Row = { label: string; bars: { id: string; title: string; start: string; end: string; priority: string | null; approved: boolean }[] };
  let rows: Row[] = [];
  if (view === "assignee") {
    const byA = new Map<string, Row>();
    for (const s of scheduled) {
      const key = s.assigneeName ?? "Unassigned";
      const r = byA.get(key) ?? { label: key, bars: [] };
      r.bars.push({ id: s.id, title: s.title, start: s.start!, end: s.end!, priority: s.priority, approved: s.status === "approved" });
      byA.set(key, r);
    }
    rows = [...byA.values()];
  } else {
    const byE = new Map<string, Row[]>();
    for (const s of scheduled) {
      const arr = byE.get(s.epicName) ?? [];
      arr.push({ label: s.title, bars: [{ id: s.id, title: `${s.title}${s.assigneeName ? ` · ${s.assigneeName}` : ""}`, start: s.start!, end: s.end!, priority: s.priority, approved: s.status === "approved" }] });
      byE.set(s.epicName, arr);
    }
    rows = [...byE.entries()].flatMap(([epicName, storyRows]) => [{ label: `▸ ${epicName}`, bars: [] as Row["bars"] }, ...storyRows]);
  }

  return (
    <div className="space-y-6">
      {/* verdict cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card
          title="Budget"
          tone={budget.unknown ? "muted" : budget.ok ? "ok" : "bad"}
          value={budget.unknown ? "—" : budget.ok ? "Within budget" : `Over by ${money(budget.delta)}`}
          sub={`Projected ${money(plan.totalCost)} · Budget ${money(project.budget)}`}
        />
        <Card
          title="Timeline"
          tone={timeline.unknown ? "muted" : timeline.ok ? "ok" : "bad"}
          value={timeline.unknown ? "—" : timeline.ok ? (timeline.days === 0 ? "On the deadline" : `${-timeline.days}d early`) : `Late by ${timeline.days}d`}
          sub={`Projected end ${plan.projectedEnd ?? "—"} · Expected ${project.endDate ?? "—"}`}
        />
        <Card
          title="Work"
          tone="muted"
          value={`${plan.totalHours.toLocaleString()} h`}
          sub={`${plan.stories.reduce((a, s) => a + (s.points ?? 0), 0)} pts · ${plan.stories.length} stories · ${project.hoursPerPoint}h/pt`}
        />
      </div>

      {/* flags */}
      {(plan.flags.unassigned > 0 || plan.flags.unpointed > 0 || plan.flags.noRate > 0 || !plan.costableAll) && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {[
            plan.flags.unassigned ? `${plan.flags.unassigned} unassigned` : null,
            plan.flags.unpointed ? `${plan.flags.unpointed} without points` : null,
            plan.flags.noRate ? `${plan.flags.noRate} with no assignee rate` : null,
          ].filter(Boolean).join(" · ")}
          {" — these aren't scheduled or costed. Cost/timeline are partial until every story has points, an assignee, and a rate."}
        </p>
      )}

      {/* gantt */}
      <div className="rounded-xl border border-neutral-200 bg-white">
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-3">
          <span className="text-sm font-medium">Gantt</span>
          <div className="flex gap-1 rounded-lg border border-neutral-200 p-0.5 text-xs">
            <button onClick={() => setView("assignee")} className={`rounded-md px-3 py-1 ${view === "assignee" ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-50"}`}>By assignee</button>
            <button onClick={() => setView("epic")} className={`rounded-md px-3 py-1 ${view === "epic" ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-50"}`}>By epic</button>
          </div>
        </div>
        {scheduled.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-neutral-400">Nothing scheduled yet. Assign stories and give them points, and they&apos;ll appear here.</p>
        ) : (
          <div className="p-5">
            <div className="mb-2 flex justify-between text-[11px] text-neutral-400">
              <span>{rangeStart}</span>
              <span>{rangeEnd}</span>
            </div>
            <div className="space-y-1.5">
              {rows.map((r, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-40 shrink-0 truncate text-xs text-neutral-600" title={r.label}>{r.label}</div>
                  <div className="relative h-6 flex-1 rounded bg-neutral-50">
                    {expectedMarker != null && expectedMarker >= 0 && expectedMarker <= 100 && (
                      <div className="absolute inset-y-0 z-10 w-px bg-red-400" style={{ left: `${expectedMarker}%` }} title={`Expected end ${project.endDate}`} />
                    )}
                    {r.bars.map((b) => {
                      const g = barGeom(b.start, b.end);
                      return (
                        <div
                          key={b.id}
                          className={`absolute inset-y-0.5 flex items-center overflow-hidden rounded px-1.5 text-[10px] text-white ${b.priority ? PRI_BAR[b.priority] ?? "bg-neutral-500" : "bg-neutral-500"} ${b.approved ? "ring-1 ring-green-600" : ""}`}
                          style={g}
                          title={`${b.title} · ${b.start} → ${b.end}${b.approved ? " · approved" : ""}`}
                        >
                          <span className="truncate">{b.title}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-neutral-400">
              <span className="flex items-center gap-1"><i className="inline-block h-2 w-2 rounded bg-red-400" />Must</span>
              <span className="flex items-center gap-1"><i className="inline-block h-2 w-2 rounded bg-amber-400" />Should</span>
              <span className="flex items-center gap-1"><i className="inline-block h-2 w-2 rounded bg-blue-400" />Could</span>
              <span className="flex items-center gap-1"><i className="inline-block h-2 w-2 rounded bg-neutral-400" />Won&apos;t</span>
              <span className="flex items-center gap-1"><i className="inline-block h-2.5 w-px bg-red-400" />Expected end</span>
              <span>Ring = approved</span>
            </div>
          </div>
        )}
      </div>

      {/* per-assignee */}
      <div className="rounded-xl border border-neutral-200 bg-white">
        <div className="border-b border-neutral-200 px-5 py-3 text-sm font-medium">By assignee</div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead><tr className="border-b border-neutral-100 text-left text-[11px] uppercase tracking-wide text-neutral-400"><th className="px-4 py-2">Assignee</th><th className="px-4 py-2">Hours</th><th className="px-4 py-2">Cost</th><th className="px-4 py-2">Window</th></tr></thead>
            <tbody>
              {plan.perAssignee.length === 0 && <tr><td colSpan={4} className="px-4 py-4 text-neutral-400">No assigned work yet.</td></tr>}
              {plan.perAssignee.map((a) => (
                <tr key={a.userId ?? a.name} className="border-b border-neutral-50">
                  <td className="px-4 py-2">{a.name}</td>
                  <td className="px-4 py-2">{a.hours.toLocaleString()} h</td>
                  <td className="px-4 py-2">{money(a.cost)}</td>
                  <td className="px-4 py-2 text-neutral-500">{a.start && a.end ? `${a.start} → ${a.end}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {notScheduled.length > 0 && (
        <p className="text-xs text-neutral-400">{notScheduled.length} stor{notScheduled.length === 1 ? "y is" : "ies are"} not scheduled (missing assignee or points).</p>
      )}
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
