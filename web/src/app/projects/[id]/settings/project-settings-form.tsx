"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateProjectSettings } from "../../actions";
import { mmddyyyyToISO, isoToMmddyyyy } from "@/lib/dates";

export default function ProjectSettingsForm({
  projectId,
  currency,
  budget,
  startDate,
  endDate,
  started,
  canManage,
}: {
  projectId: string;
  currency: string;
  budget: number | null;
  startDate: string | null;
  endDate: string | null;
  started: boolean;
  canManage: boolean;
}) {
  const router = useRouter();
  const [budgetV, setBudgetV] = useState(budget != null ? String(budget) : "");
  const [startV, setStartV] = useState(isoToMmddyyyy(startDate));
  const [endV, setEndV] = useState(isoToMmddyyyy(endDate));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setOk(false);

    if (!budgetV.trim()) return setErr("Budget is required.");
    if (!started && !startV.trim()) return setErr("Expected start is required.");
    if (!endV.trim()) return setErr("Expected end is required.");

    const startISO = started ? startDate : mmddyyyyToISO(startV);
    if (!started && !startISO) return setErr("Expected start must be MM/DD/YYYY.");
    const endISO = mmddyyyyToISO(endV);
    if (!endISO) return setErr("Expected end must be MM/DD/YYYY.");

    setBusy(true);
    const r = await updateProjectSettings(projectId, {
      budget: Math.round(Number(budgetV)),
      startDate: startISO,
      endDate: endISO,
    });
    setBusy(false);
    if (r?.error) return setErr(r.error);
    setOk(true);
    router.refresh();
  }

  const field = "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900 disabled:bg-neutral-50 disabled:text-neutral-400";
  const label = "mb-1 block text-sm font-medium text-neutral-700";

  return (
    <form onSubmit={submit} className="rounded-xl border border-neutral-200 bg-white p-6">
      <h2 className="text-sm font-medium">Project details</h2>
      {started && (
        <p className="mt-1 text-xs text-amber-600">This project has started — the expected start date is locked. You can still adjust the expected end date.</p>
      )}
      {err && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      {ok && <p className="mt-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">Saved.</p>}

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <label className={label}>Budget ({currency}) *</label>
          <input required disabled={!canManage} type="number" min="0" value={budgetV} onChange={(e) => setBudgetV(e.target.value)} className={field} />
        </div>
        <div />
        <div>
          <label className={label}>Expected start *</label>
          <input
            required={!started}
            disabled={!canManage || started}
            value={startV}
            onChange={(e) => setStartV(e.target.value)}
            placeholder="MM/DD/YYYY"
            inputMode="numeric"
            className={field}
          />
        </div>
        <div>
          <label className={label}>Expected end *</label>
          <input required disabled={!canManage} value={endV} onChange={(e) => setEndV(e.target.value)} placeholder="MM/DD/YYYY" inputMode="numeric" className={field} />
        </div>
      </div>

      {canManage && (
        <button disabled={busy} className="mt-5 rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50">
          {busy ? "Saving…" : "Save changes"}
        </button>
      )}
    </form>
  );
}
