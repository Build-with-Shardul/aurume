"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { parseISO, toISO } from "@/lib/schedule";
import { formatBudget } from "@/lib/currencies";
import type { ResourceAllocation } from "@/lib/resource";
import { addLeave, deleteLeave } from "../actions";

type LeaveRow = { id: string; start: string; end: string; type: string; note: string | null };
const DAY_W = 26;
const LABEL_W = 200;
const PCOLORS = ["bg-blue-400", "bg-green-500", "bg-purple-400", "bg-amber-400", "bg-pink-400", "bg-teal-400", "bg-indigo-400"];
const pcolor = (i: number) => PCOLORS[i % PCOLORS.length];

type Col = { iso: string; dom: number; month: number; year: number; monthLabel: string };
function buildColumns(startISO: string, endISO: string): Col[] {
  const cols: Col[] = [];
  let d = parseISO(startISO);
  const end = parseISO(endISO);
  while (d.getTime() <= end.getTime()) {
    const g = d.getUTCDay();
    if (g !== 0 && g !== 6) cols.push({ iso: toISO(d), dom: d.getUTCDate(), month: d.getUTCMonth(), year: d.getUTCFullYear(), monthLabel: d.toLocaleDateString("en-US", { month: "long", timeZone: "UTC" }) });
    const n = new Date(d);
    n.setUTCDate(n.getUTCDate() + 1);
    d = n;
  }
  return cols;
}

export default function ResourceClient({ userId, alloc, leaves }: { userId: string; alloc: ResourceAllocation; leaves: LeaveRow[] }) {
  const router = useRouter();
  const cur = alloc.currency;
  const money = (n: number | null) => (n == null ? "—" : formatBudget(Math.round(n), cur));
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [ls, setLs] = useState("");
  const [le, setLe] = useState("");
  const [lt, setLt] = useState("leave");
  const [ln, setLn] = useState("");

  async function run(key: string, fn: () => Promise<{ error?: string } | void>, after?: () => void) {
    setErr(""); setBusy(key);
    const r = await fn();
    setBusy("");
    if (r && "error" in r && r.error) return setErr(r.error);
    after?.();
    router.refresh();
  }

  // axis from all stories + leaves
  const dts: string[] = [];
  alloc.projects.forEach((p) => p.stories.forEach((s) => { dts.push(s.start, s.end); }));
  leaves.forEach((l) => { dts.push(l.start.slice(0, 10), l.end.slice(0, 10)); });
  const sorted = dts.sort();
  const hasTimeline = sorted.length > 0;
  const cols = hasTimeline ? buildColumns(sorted[0], sorted[sorted.length - 1]) : [];
  const gridW = cols.length * DAY_W;
  const idxStart = (iso: string) => { const i = cols.findIndex((c) => c.iso >= iso.slice(0, 10)); return i < 0 ? cols.length - 1 : i; };
  const idxEnd = (iso: string) => { for (let i = cols.length - 1; i >= 0; i--) if (cols[i].iso <= iso.slice(0, 10)) return i; return 0; };
  const monthSpans = (() => {
    const out: { label: string; count: number }[] = [];
    cols.forEach((c, i) => { const k = `${c.year}-${c.month}`; const prev = i > 0 ? `${cols[i - 1].year}-${cols[i - 1].month}` : null; if (prev === k) out[out.length - 1].count++; else out.push({ label: `${c.monthLabel} ${c.year}`, count: 1 }); });
    return out;
  })();

  function geom(startISO: string, endISO: string) {
    const l = idxStart(startISO) * DAY_W;
    const w = (idxEnd(endISO) - idxStart(startISO) + 1) * DAY_W;
    return { left: l + 1, width: Math.max(DAY_W - 2, w - 2) };
  }

  return (
    <div className="space-y-6">
      {/* summary */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card title="Projects" value={String(alloc.projects.filter((p) => p.storyCount > 0).length)} sub={`${alloc.projects.length} assigned`} />
        <Card title="Scheduled hours" value={`${alloc.totalHours.toLocaleString()} h`} sub="across all projects" />
        <Card title="Est. cost" value={money(alloc.totalCost)} sub="labor at project rates" />
        <Card title="Leave entries" value={String(leaves.length)} sub="time off" />
      </div>

      {/* projects table */}
      <div className="rounded-xl border border-neutral-200 bg-white">
        <div className="border-b border-neutral-200 px-5 py-3 text-sm font-medium">Project assignments</div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead><tr className="border-b border-neutral-100 text-left text-[11px] uppercase tracking-wide text-neutral-400"><th className="px-4 py-2">Project</th><th className="px-4 py-2">Rate</th><th className="px-4 py-2">Stories</th><th className="px-4 py-2">Hours</th><th className="px-4 py-2">Cost</th><th className="px-4 py-2">Window</th></tr></thead>
            <tbody>
              {alloc.projects.length === 0 && <tr><td colSpan={6} className="px-4 py-4 text-neutral-400">Not on any projects yet.</td></tr>}
              {alloc.projects.map((p, i) => (
                <tr key={p.projectId} className="border-b border-neutral-50">
                  <td className="px-4 py-2"><span className={`mr-2 inline-block h-2 w-2 rounded ${pcolor(i)}`} /><a href={`/projects/${p.projectId}/plan`} className="font-medium text-neutral-900 hover:underline">{p.name}</a></td>
                  <td className="px-4 py-2 text-neutral-500">{p.rate != null ? `${formatBudget(p.rate, p.currency)}/hr` : "no rate"} · {p.hoursPerDay}h/day</td>
                  <td className="px-4 py-2 text-neutral-500">{p.storyCount}</td>
                  <td className="px-4 py-2">{p.hours.toLocaleString()} h</td>
                  <td className="px-4 py-2">{money(p.cost)}</td>
                  <td className="px-4 py-2 text-neutral-500">{p.start && p.end ? `${p.start} → ${p.end}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* cross-project calendar */}
      <div className="rounded-xl border border-neutral-200 bg-white">
        <div className="border-b border-neutral-200 px-5 py-3 text-sm font-medium">Calendar — across projects</div>
        {!hasTimeline ? (
          <p className="px-5 py-10 text-center text-sm text-neutral-400">No scheduled work or leave to show.</p>
        ) : (
          <div className="overflow-x-auto">
            <div style={{ minWidth: LABEL_W + gridW }}>
              <div className="flex border-b border-neutral-200 bg-neutral-50 text-[11px] text-neutral-500">
                <div className="sticky left-0 z-30 shrink-0 border-r border-neutral-200 bg-neutral-50" style={{ width: LABEL_W }} />
                <div style={{ width: gridW }}>
                  <div className="flex">{monthSpans.map((s, i) => <div key={i} className="border-l border-neutral-200 px-2 py-0.5 font-medium text-neutral-700" style={{ width: s.count * DAY_W }}>{s.label}</div>)}</div>
                  <div className="flex">{cols.map((c, i) => <div key={c.iso} className={`border-l text-center ${c.dom === 1 || i === 0 ? "border-neutral-300" : "border-neutral-100"}`} style={{ width: DAY_W }}>{c.dom}</div>)}</div>
                </div>
              </div>
              {alloc.projects.filter((p) => p.stories.length).map((p, i) => (
                <div key={p.projectId} className="flex items-center border-b border-neutral-50">
                  <div className="sticky left-0 z-20 shrink-0 truncate border-r border-neutral-200 bg-white px-4 py-1.5 text-xs font-medium text-neutral-800" style={{ width: LABEL_W }} title={p.name}>{p.name}</div>
                  <div className="relative h-7" style={{ width: gridW }}>
                    {cols.map((c, j) => <div key={c.iso} className="absolute inset-y-0 border-l border-neutral-100" style={{ left: j * DAY_W, width: DAY_W }} />)}
                    {p.stories.map((s) => (
                      <div key={s.id} className={`absolute inset-y-1 z-20 flex items-center overflow-hidden rounded px-1.5 text-[10px] text-white ${pcolor(i)}`} style={geom(s.start, s.end)} title={`${s.title} · ${s.start} → ${s.end}`}>
                        <span className="truncate">{s.title}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {leaves.length > 0 && (
                <div className="flex items-center border-b border-neutral-50 bg-neutral-50/40">
                  <div className="sticky left-0 z-20 shrink-0 border-r border-neutral-200 bg-neutral-50/40 px-4 py-1.5 text-xs font-medium text-neutral-600" style={{ width: LABEL_W }}>Time off</div>
                  <div className="relative h-7" style={{ width: gridW }}>
                    {leaves.map((l) => (
                      <div key={l.id} className="absolute inset-y-1 z-20 flex items-center overflow-hidden rounded px-1 text-[9px] text-neutral-600" style={{ ...geom(l.start.slice(0, 10), l.end.slice(0, 10)), backgroundImage: "repeating-linear-gradient(45deg,#e5e7eb,#e5e7eb 4px,#f3f4f6 4px,#f3f4f6 8px)" }} title={`${l.type} ${l.start} → ${l.end}`}>
                        <span className="truncate uppercase">{l.type}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* monthly allocation */}
      {alloc.months.length > 0 && (
        <div className="rounded-xl border border-neutral-200 bg-white">
          <div className="border-b border-neutral-200 px-5 py-3 text-sm font-medium">Monthly allocation (hours)</div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead><tr className="border-b border-neutral-100 text-left text-[11px] uppercase tracking-wide text-neutral-400"><th className="px-4 py-2">Month</th>{alloc.projects.filter((p) => p.stories.length).map((p) => <th key={p.projectId} className="px-4 py-2">{p.name}</th>)}<th className="px-4 py-2">Total</th></tr></thead>
              <tbody>
                {alloc.months.map((mo) => (
                  <tr key={mo.month} className="border-b border-neutral-50">
                    <td className="px-4 py-2 font-medium">{mo.label}</td>
                    {alloc.projects.filter((p) => p.stories.length).map((p) => <td key={p.projectId} className="px-4 py-2 text-neutral-600">{mo.byProject[p.projectId] ? `${mo.byProject[p.projectId]} h` : "—"}</td>)}
                    <td className="px-4 py-2 font-medium">{mo.total} h</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* leaves */}
      <div className="rounded-xl border border-neutral-200 bg-white p-5">
        <h2 className="text-sm font-medium">Leave / time off</h2>
        <p className="mt-0.5 text-xs text-neutral-400">Applies across all this person&apos;s projects — schedules skip these days.</p>
        {err && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
        <ul className="mt-3 divide-y divide-neutral-100">
          {leaves.length === 0 && <li className="py-2 text-sm text-neutral-400">No leave recorded.</li>}
          {leaves.map((l) => (
            <li key={l.id} className="flex items-center justify-between py-2 text-sm">
              <span><span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] font-medium uppercase text-neutral-600">{l.type}</span> <span className="ml-2">{l.start.slice(0, 10)} → {l.end.slice(0, 10)}</span>{l.note && <span className="ml-2 text-neutral-400">{l.note}</span>}</span>
              <button disabled={busy === `del-${l.id}`} onClick={() => run(`del-${l.id}`, () => deleteLeave(l.id))} className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs hover:bg-neutral-50 disabled:opacity-50">Remove</button>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="text-xs text-neutral-500">Start<input type="date" value={ls} onChange={(e) => setLs(e.target.value)} className="mt-0.5 block rounded-md border border-neutral-300 px-2 py-1 text-sm" /></label>
          <label className="text-xs text-neutral-500">End<input type="date" value={le} onChange={(e) => setLe(e.target.value)} className="mt-0.5 block rounded-md border border-neutral-300 px-2 py-1 text-sm" /></label>
          <label className="text-xs text-neutral-500">Type<select value={lt} onChange={(e) => setLt(e.target.value)} className="mt-0.5 block rounded-md border border-neutral-300 px-2 py-1 text-sm"><option value="leave">Leave</option><option value="pto">PTO</option><option value="holiday">Holiday</option></select></label>
          <input value={ln} onChange={(e) => setLn(e.target.value)} placeholder="Note (optional)" className="flex-1 rounded-md border border-neutral-300 px-2 py-1 text-sm" />
          <button disabled={busy === "add" || !ls || !le} onClick={() => run("add", () => addLeave(userId, ls, le, lt, ln), () => { setLs(""); setLe(""); setLn(""); })} className="rounded-lg bg-neutral-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50">Add leave</button>
        </div>
      </div>
    </div>
  );
}

function Card({ title, value, sub }: { title: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-neutral-400">{title}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
      <div className="mt-0.5 text-xs text-neutral-400">{sub}</div>
    </div>
  );
}
