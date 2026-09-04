"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { shareDiagramWithUser, unshareDiagramUser } from "../actions";
import type { ShareUser } from "@/lib/wiki";

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return (parts.length >= 2 ? parts[0][0] + parts[1][0] : name.slice(0, 2)).toUpperCase();
}

export default function DiagramSharePanel({ diagramId, shares, shareableUsers, onClose }: { diagramId: string; shares: ShareUser[]; shareableUsers: ShareUser[]; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  const candidates = useMemo(() => {
    const t = q.trim().toLowerCase();
    return shareableUsers.filter((u) => !t || u.name.toLowerCase().includes(t));
  }, [q, shareableUsers]);

  async function add(userId: string) {
    if (busy) return;
    setBusy(true);
    await shareDiagramWithUser(diagramId, userId);
    setBusy(false);
    router.refresh();
  }
  async function remove(userId: string) {
    if (busy) return;
    setBusy(true);
    await unshareDiagramUser(diagramId, userId);
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-900">Share this diagram</h2>
          <button onClick={onClose} aria-label="Close" className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700">✕</button>
        </div>

        {shares.length > 0 && (
          <div className="mb-3">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Shared with</div>
            <ul className="space-y-1">
              {shares.map((u) => (
                <li key={u.id} className="flex items-center gap-2 rounded-lg px-1 py-1 text-sm">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-neutral-200 text-[9px] font-semibold text-neutral-700">{initials(u.name)}</span>
                  <span className="min-w-0 flex-1 truncate text-neutral-800">{u.name}</span>
                  <button onClick={() => remove(u.id)} disabled={busy} className="rounded px-2 py-0.5 text-xs text-neutral-400 hover:bg-neutral-100 hover:text-red-600 disabled:opacity-50">Remove</button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Add people</div>
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search workspace members…" className="mb-2 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900" />
        {candidates.length === 0 ? (
          <p className="px-1 py-2 text-sm text-neutral-400">No one to add.</p>
        ) : (
          <ul className="max-h-56 space-y-0.5 overflow-y-auto">
            {candidates.map((u) => (
              <li key={u.id}>
                <button onClick={() => add(u.id)} disabled={busy} className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left text-sm hover:bg-neutral-50 disabled:opacity-50">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-neutral-200 text-[9px] font-semibold text-neutral-700">{initials(u.name)}</span>
                  <span className="min-w-0 flex-1 truncate text-neutral-800">{u.name}</span>
                  <span className="text-xs text-neutral-400">Add</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
