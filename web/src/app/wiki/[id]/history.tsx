"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getHistory, restoreVersion } from "../actions";
import type { HistoryItem } from "@/lib/wiki";

export default function History({ docId, editable }: { docId: string; editable: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<HistoryItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  async function openPanel() {
    setOpen(true);
    setLoading(true);
    setItems(null);
    const r = await getHistory(docId);
    setLoading(false);
    if (r && "items" in r) setItems(r.items ?? []);
  }

  async function restore(versionId: string) {
    if (busy) return;
    setBusy(true);
    await restoreVersion(versionId);
    setBusy(false);
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button onClick={openPanel} className="rounded-lg border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50">History</button>
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={() => setOpen(false)}>
          <div className="h-full w-full max-w-sm overflow-y-auto bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-neutral-900">History</h2>
              <button onClick={() => setOpen(false)} aria-label="Close" className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700">✕</button>
            </div>

            {loading && <p className="text-sm text-neutral-400">Loading…</p>}
            {items && items.length === 0 && <p className="text-sm text-neutral-400">No history yet.</p>}

            <ol className="space-y-3">
              {items?.map((it) => (
                <li key={it.id} className="flex items-start gap-2.5 text-sm">
                  <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${it.kind === "version" ? "bg-blue-400" : "bg-neutral-300"}`} />
                  <div className="min-w-0 flex-1">
                    <div className="leading-snug">
                      <span className="font-medium text-neutral-900">{it.actorName}</span> <span className="text-neutral-600">{it.label}</span>
                    </div>
                    <div className="text-xs text-neutral-400">{it.whenLabel}</div>
                  </div>
                  {it.kind === "version" && editable && it.versionId && (
                    <button onClick={() => restore(it.versionId!)} disabled={busy} className="shrink-0 rounded border border-neutral-200 px-2 py-0.5 text-xs text-neutral-600 hover:bg-neutral-50 disabled:opacity-50">
                      Restore
                    </button>
                  )}
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </>
  );
}
