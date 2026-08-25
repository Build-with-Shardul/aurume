"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createProject } from "../actions";

type OrgMember = { userId: string; name: string; email: string };

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
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [budget, setBudget] = useState("");
  const [currency, setCurrency] = useState(currencies[0] ?? "USD");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  function toggle(id: string) {
    setMemberIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const r = await createProject({
      name,
      description,
      budget: budget.trim() ? Math.round(Number(budget)) : null,
      currency,
      startDate: startDate || null,
      endDate: endDate || null,
      memberIds,
    });
    setBusy(false);
    if (r?.error) return setErr(r.error);
    router.push(`/projects/${r.id}`);
    router.refresh();
  }

  const field = "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900";
  const label = "mb-1 block text-sm font-medium text-neutral-700";
  const others = orgMembers.filter((o) => o.userId !== meId);

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

      <div className="mb-4 grid grid-cols-2 gap-3">
        <div>
          <label className={label}>Expected start</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={field} />
        </div>
        <div>
          <label className={label}>Expected end</label>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={field} />
        </div>
      </div>

      <label className={label}>Members</label>
      <p className="-mt-1 mb-2 text-xs text-neutral-400">You&apos;re added automatically. Pick who else works on this project (you can change this later).</p>
      <div className="mb-6 max-h-48 overflow-y-auto rounded-lg border border-neutral-200">
        {others.length === 0 ? (
          <p className="px-3 py-3 text-sm text-neutral-400">No other members in this workspace yet.</p>
        ) : (
          others.map((o) => (
            <label key={o.userId} className="flex cursor-pointer items-center gap-3 border-b border-neutral-100 px-3 py-2 text-sm last:border-b-0 hover:bg-neutral-50">
              <input type="checkbox" checked={memberIds.includes(o.userId)} onChange={() => toggle(o.userId)} className="accent-neutral-900" />
              <span>
                <span className="font-medium">{o.name || o.email}</span>
                {o.name && <span className="ml-2 text-neutral-400">{o.email}</span>}
              </span>
            </label>
          ))
        )}
      </div>

      <button disabled={busy} className="rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50">
        {busy ? "Creating…" : "Create project"}
      </button>
    </form>
  );
}
