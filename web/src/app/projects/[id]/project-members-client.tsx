"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addProjectMember, removeProjectMember } from "../actions";

type Person = { userId: string; name: string; email: string };

export default function ProjectMembersClient({
  projectId,
  members,
  addable,
  canManage,
}: {
  projectId: string;
  members: Person[];
  addable: Person[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [toAdd, setToAdd] = useState("");

  async function add() {
    if (!toAdd) return;
    setBusy("add");
    setErr("");
    const r = await addProjectMember(projectId, toAdd);
    setBusy("");
    if (r?.error) return setErr(r.error);
    setToAdd("");
    router.refresh();
  }

  async function remove(userId: string) {
    setBusy(userId);
    setErr("");
    const r = await removeProjectMember(projectId, userId);
    setBusy("");
    if (r?.error) return setErr(r.error);
    router.refresh();
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-white">
      <div className="border-b border-neutral-200 px-6 py-3 text-sm font-medium">Members ({members.length})</div>

      {err && <p className="mx-6 mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}

      <ul className="divide-y divide-neutral-100">
        {members.map((p) => (
          <li key={p.userId} className="flex items-center justify-between px-6 py-3 text-sm">
            <span>
              <span className="font-medium">{p.name || p.email}</span>
              {p.name && <span className="ml-2 text-neutral-400">{p.email}</span>}
            </span>
            {canManage && (
              <button
                onClick={() => remove(p.userId)}
                disabled={busy === p.userId}
                className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs hover:bg-neutral-50 disabled:opacity-50"
              >
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>

      {canManage && (
        <div className="flex items-center gap-2 border-t border-neutral-200 px-6 py-3">
          <select value={toAdd} onChange={(e) => setToAdd(e.target.value)} className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900">
            <option value="">Add a member…</option>
            {addable.map((o) => (
              <option key={o.userId} value={o.userId}>
                {o.name || o.email}
              </option>
            ))}
          </select>
          <button
            onClick={add}
            disabled={!toAdd || busy === "add"}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
          >
            {busy === "add" ? "Adding…" : "Add"}
          </button>
        </div>
      )}
    </div>
  );
}
