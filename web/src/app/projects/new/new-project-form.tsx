"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createProject } from "../actions";
import { mmddyyyyToISO } from "@/lib/dates";

type OrgMember = { userId: string; name: string; email: string };
type Row = { include: boolean; rate: string; timezone: string };

function useTimezones() {
  return useMemo(() => {
    try {
      const anyIntl = Intl as unknown as { supportedValuesOf?: (k: string) => string[] };
      if (anyIntl.supportedValuesOf) return anyIntl.supportedValuesOf("timeZone");
    } catch {
      /* fall through */
    }
    return ["UTC", "America/New_York", "America/Los_Angeles", "Europe/London", "Asia/Kolkata", "Asia/Singapore", "Australia/Sydney"];
  }, []);
}

function browserTz() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export default function NewProjectForm({
  orgMembers,
  meId,
  currencies,
}: {
  orgMembers: OrgMember[];
  meId: string;
  currencies: string[];
}) {
  const router = useRouter();
  const timezones = useTimezones();
  const tz = browserTz();
  const others = orgMembers.filter((o) => o.userId !== meId);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [budget, setBudget] = useState("");
  const [currency, setCurrency] = useState(currencies[0] ?? "USD");
  const [hpp, setHpp] = useState("8");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [rows, setRows] = useState<Record<string, Row>>(() =>
    Object.fromEntries(others.map((o) => [o.userId, { include: false, rate: "", timezone: tz }])),
  );
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  function setRow(id: string, patch: Partial<Row>) {
    setRows((r) => ({ ...r, [id]: { ...r[id], ...patch } }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");

    if (!budget.trim()) return setErr("Budget is required.");
    if (!currency) return setErr("Currency is required.");
    if (!startDate.trim()) return setErr("Expected start is required.");
    if (!endDate.trim()) return setErr("Expected end is required.");

    const startISO = mmddyyyyToISO(startDate);
    if (!startISO) return setErr("Expected start must be MM/DD/YYYY.");
    const endISO = mmddyyyyToISO(endDate);
    if (!endISO) return setErr("Expected end must be MM/DD/YYYY.");

    const chosen = others.filter((o) => rows[o.userId]?.include);
    for (const o of chosen) {
      const row = rows[o.userId];
      if (!row.rate.trim()) return setErr(`Set an hourly rate for ${o.name || o.email}.`);
      if (!row.timezone) return setErr(`Set a timezone for ${o.name || o.email}.`);
    }
    const members = chosen.map((o) => ({
      userId: o.userId,
      rate: Math.round(Number(rows[o.userId].rate)),
      timezone: rows[o.userId].timezone,
    }));

    setBusy(true);
    const r = await createProject({
      name,
      description,
      budget: Math.round(Number(budget)),
      currency,
      hoursPerPoint: hpp.trim() ? Math.round(Number(hpp)) : 8,
      startDate: startISO,
      endDate: endISO,
      members,
    });
    setBusy(false);
    if (r?.error) return setErr(r.error);
    router.push(`/projects/${r.id}`);
    router.refresh();
  }

  const field = "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900";
  const label = "mb-1 block text-sm font-medium text-neutral-700";

  return (
    <form onSubmit={submit} className="mt-6 rounded-xl border border-neutral-200 bg-white p-6">
      {err && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}

      <label className={label}>Project name</label>
      <input required value={name} onChange={(e) => setName(e.target.value)} className={`${field} mb-4`} />

      <label className={label}>Description</label>
      <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className={`${field} mb-4`} />

      <div className="mb-4 grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <label className={label}>Budget *</label>
          <input required type="number" min="0" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="0" className={field} />
        </div>
        <div>
          <label className={label}>Currency *</label>
          <select required value={currency} onChange={(e) => setCurrency(e.target.value)} className={field}>
            {currencies.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="mb-4">
        <label className={label}>1 story point = hours</label>
        <div className="flex flex-wrap items-center gap-2">
          <input type="number" min="1" value={hpp} onChange={(e) => setHpp(e.target.value)} className={`${field} w-28`} />
          <span className="text-xs text-neutral-400">hours</span>
          {[1, 2, 3, 8].map((n) => (
            <button key={n} type="button" onClick={() => setHpp(String(n))} className={`rounded-md border px-2.5 py-1 text-xs ${hpp === String(n) ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 hover:bg-neutral-50"}`}>{n}h</button>
          ))}
          <span className="text-xs text-neutral-400">Used for story hours, cost, and scheduling.</span>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3">
        <div>
          <label className={label}>Expected start *</label>
          <input required value={startDate} onChange={(e) => setStartDate(e.target.value)} placeholder="MM/DD/YYYY" inputMode="numeric" className={field} />
        </div>
        <div>
          <label className={label}>Expected end *</label>
          <input required value={endDate} onChange={(e) => setEndDate(e.target.value)} placeholder="MM/DD/YYYY" inputMode="numeric" className={field} />
        </div>
      </div>

      <label className={label}>Members</label>
      <p className="-mt-1 mb-2 text-xs text-neutral-400">
        You&apos;re added automatically. Check who else works on this project — an hourly rate ({currency}) and timezone are required for each. You can change all of this later.
      </p>
      <div className="mb-6 overflow-hidden rounded-lg border border-neutral-200">
        {others.length === 0 ? (
          <p className="px-3 py-3 text-sm text-neutral-400">No other members in this workspace yet.</p>
        ) : (
          others.map((o) => {
            const row = rows[o.userId];
            return (
              <div key={o.userId} className="border-b border-neutral-100 px-3 py-2 last:border-b-0">
                <div className="flex items-center gap-3">
                  <input type="checkbox" checked={row.include} onChange={(e) => setRow(o.userId, { include: e.target.checked })} className="accent-neutral-900" />
                  <span className="text-sm">
                    <span className="font-medium">{o.name || o.email}</span>
                    {o.name && <span className="ml-2 text-neutral-400">{o.email}</span>}
                  </span>
                </div>
                {row.include && (
                  <div className="mt-2 grid grid-cols-2 gap-2 pl-7">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-neutral-400">{currency}/hr</span>
                      <input required type="number" min="0" value={row.rate} onChange={(e) => setRow(o.userId, { rate: e.target.value })} placeholder="Rate *" className="w-full rounded-md border border-neutral-300 px-2 py-1 text-sm outline-none focus:border-neutral-900" />
                    </div>
                    <select value={row.timezone} onChange={(e) => setRow(o.userId, { timezone: e.target.value })} className="w-full rounded-md border border-neutral-300 px-2 py-1 text-sm outline-none focus:border-neutral-900">
                      {timezones.map((z) => (
                        <option key={z} value={z}>{z}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <button disabled={busy} className="rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50">
        {busy ? "Creating…" : "Create project"}
      </button>
    </form>
  );
}
