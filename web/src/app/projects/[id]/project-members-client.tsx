"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { addProjectMember, removeProjectMember, updateProjectMember } from "../actions";

type Person = { userId: string; name: string; email: string; rate?: number | null; timezone?: string | null; hoursPerDay?: number | null };

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

export default function ProjectMembersClient({
  projectId,
  members,
  addable,
  canManage,
  currency,
}: {
  projectId: string;
  members: Person[];
  addable: Person[];
  canManage: boolean;
  currency: string;
}) {
  const router = useRouter();
  const timezones = useTimezones();
  const defaultTz = (() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
      return "UTC";
    }
  })();

  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  // add
  const [toAdd, setToAdd] = useState("");
  const [addRate, setAddRate] = useState("");
  const [addTz, setAddTz] = useState(defaultTz);
  const [addHpd, setAddHpd] = useState("8");

  // edit
  const [editId, setEditId] = useState("");
  const [editRate, setEditRate] = useState("");
  const [editTz, setEditTz] = useState(defaultTz);
  const [editHpd, setEditHpd] = useState("8");

  async function act(id: string, fn: () => Promise<{ error?: string } | void>) {
    setBusy(id);
    setErr("");
    const r = await fn();
    setBusy("");
    if (r && "error" in r && r.error) return setErr(r.error);
    router.refresh();
  }

  const field = "rounded-md border border-neutral-300 px-2 py-1 text-sm outline-none focus:border-neutral-900";

  return (
    <div className="rounded-xl border border-neutral-200 bg-white">
      <div className="border-b border-neutral-200 px-6 py-3 text-sm font-medium">Members ({members.length})</div>
      {err && <p className="mx-6 mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}

      <ul className="divide-y divide-neutral-100">
        {members.map((p) => (
          <li key={p.userId} className="px-6 py-3 text-sm">
            {editId === p.userId ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-40 font-medium">{p.name || p.email}</span>
                <span className="text-xs text-neutral-400">{currency}/hr</span>
                <input required type="number" min="0" value={editRate} onChange={(e) => setEditRate(e.target.value)} placeholder="Rate *" className={`${field} w-24`} />
                <select required value={editTz} onChange={(e) => setEditTz(e.target.value)} className={`${field} w-52`}>
                  {timezones.map((z) => (
                    <option key={z} value={z}>{z}</option>
                  ))}
                </select>
                <input type="number" min="1" value={editHpd} onChange={(e) => setEditHpd(e.target.value)} className={`${field} w-16`} title="Hours per day (capacity)" />
                <span className="text-xs text-neutral-400">h/day</span>
                <button
                  disabled={busy === p.userId || !editRate.trim() || !editTz}
                  onClick={() => act(p.userId, () => updateProjectMember(projectId, p.userId, Math.round(Number(editRate)), editTz, editHpd.trim() ? Math.round(Number(editHpd)) : 8)).then(() => setEditId(""))}
                  className="rounded-md bg-neutral-900 px-3 py-1 text-xs font-medium text-white hover:bg-neutral-800"
                >
                  Save
                </button>
                <button onClick={() => setEditId("")} className="text-xs text-neutral-500 hover:text-neutral-900">Cancel</button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <span>
                  <span className="font-medium">{p.name || p.email}</span>
                  {p.name && <span className="ml-2 text-neutral-400">{p.email}</span>}
                </span>
                <span className="flex items-center gap-3">
                  <span className="text-xs text-neutral-500">
                    {p.rate != null ? `${currency} ${p.rate.toLocaleString()}/hr` : "no rate"}
                    {p.timezone ? ` · ${p.timezone}` : ""}
                    {` · ${p.hoursPerDay ?? 8}h/day`}
                  </span>
                  {canManage && (
                    <>
                      <button
                        onClick={() => { setEditId(p.userId); setEditRate(p.rate != null ? String(p.rate) : ""); setEditTz(p.timezone || defaultTz); setEditHpd(String(p.hoursPerDay ?? 8)); }}
                        className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs hover:bg-neutral-50"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => act(p.userId, () => removeProjectMember(projectId, p.userId))}
                        disabled={busy === p.userId}
                        className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs hover:bg-neutral-50 disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </>
                  )}
                </span>
              </div>
            )}
          </li>
        ))}
      </ul>

      {canManage && addable.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-neutral-200 px-6 py-3">
          <select value={toAdd} onChange={(e) => setToAdd(e.target.value)} className={`${field} flex-1`}>
            <option value="">Add a member…</option>
            {addable.map((o) => (
              <option key={o.userId} value={o.userId}>{o.name || o.email}</option>
            ))}
          </select>
          <span className="text-xs text-neutral-400">{currency}/hr</span>
          <input required type="number" min="0" value={addRate} onChange={(e) => setAddRate(e.target.value)} placeholder="Rate *" className={`${field} w-24`} />
          <select required value={addTz} onChange={(e) => setAddTz(e.target.value)} className={`${field} w-44`}>
            {timezones.map((z) => (
              <option key={z} value={z}>{z}</option>
            ))}
          </select>
          <input type="number" min="1" value={addHpd} onChange={(e) => setAddHpd(e.target.value)} className={`${field} w-16`} title="Hours per day" />
          <span className="text-xs text-neutral-400">h/day</span>
          <button
            onClick={() => { if (toAdd && addRate.trim() && addTz) act("add", () => addProjectMember(projectId, toAdd, Math.round(Number(addRate)), addTz, addHpd.trim() ? Math.round(Number(addHpd)) : 8)).then(() => { setToAdd(""); setAddRate(""); }); }}
            disabled={!toAdd || !addRate.trim() || !addTz || busy === "add"}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
          >
            {busy === "add" ? "Adding…" : "Add"}
          </button>
        </div>
      )}
    </div>
  );
}
