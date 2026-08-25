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

    let startISO: string | null = null;
    let endISO: string | null = null;
    if (startDate.trim()) {
      startISO = mmddyyyyToISO(startDate);
      if (!startISO) return setErr("Expected start must be MM/DD/YYYY.");
    }
    if (endDate.trim()) {
      endISO = mmddyyyyToISO(endDate);
      if (!endISO) return setErr("Expected end must be MM/DD/YYYY.");
    }

    const members = others
      .filter((o) => rows[o.userId]?.include)
      .map((o) => ({
        userId: o.userId,
        rate: rows[o.userId].rate.trim() ? Math.round(Number(rows[o.userId].rate)) : null,
        timezone: rows[o.userId].timezone || null,
      }));

    setBusy(true);
    const r = await createProject({
      name,
      description,
      budget: budget.trim() ? Math.round(Number(budget)) : null,
      currency,
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
          <label className={label}>Budget</label>
          <input type="number" min="0" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="0" className={field} />
        </div>
        <div>
          <label className={label}>Currency</label>
          <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={field}>
            {currencies.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3">
        <div>
          <label className={label}>Expected start</label>
          <input value={startDate} onChange={(e) => setStartDate(e.target.value)} placeholder="MM/DD/YYYY" inputMode="numeric" className={field} />
        </div>
        <div>
          <label className={label}>Expected end</label>
          <input value={endDate} onChange={(e) => setEndDate(e.target.value)} placeholder="MM/DD/YYYY" inputMode="numeric" className={field} />
        </div>
      </div>

      <label className={label}>Members</label>
      <p className="-mt-1 mb-2 text-xs text-neutral-400">
        You&apos;re added automatically. Check who else works on this project and set their hourly rate ({currency}) and timezone. You can change all of this later.
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
                      <input type="number" min="0" value={row.rate} onChange={(e) => setRow(o.userId, { rate: e.target.value })} placeholder="Rate" className="w-full rounded-md border border-neutral-300 px-2 py-1 text-sm outline-none focus:border-neutral-900" />
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
