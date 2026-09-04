"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { restoreVersion } from "../../actions";
import type { HistoryItem } from "@/lib/wiki";

export default function HistoryView({ docId, items, editable }: { docId: string; items: HistoryItem[]; editable: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function restore(versionId: string) {
    if (busy) return;
    setBusy(true);
    await restoreVersion(versionId);
    // A restore edits the page — go back to it so the result is visible.
    router.push(`/wiki/${docId}`);
  }

  if (items.length === 0) return <p className="mt-6 text-sm text-neutral-400">No history yet.</p>;

  return (
    <ol className="mt-6 space-y-3">
      {items.map((it) => (
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
  );
}
