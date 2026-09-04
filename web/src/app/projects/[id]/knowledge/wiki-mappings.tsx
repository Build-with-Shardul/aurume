"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { mapDocument, unmapDocument } from "./actions";
import type { MappableDoc } from "@/lib/wiki";

export default function WikiMappings({ projectId, mapped, mappable }: { projectId: string; mapped: MappableDoc[]; mappable: MappableDoc[] }) {
  const router = useRouter();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmDoc, setConfirmDoc] = useState<MappableDoc | null>(null);
  const [busy, setBusy] = useState(false);

  async function doMap(docId: string) {
    setBusy(true);
    await mapDocument(projectId, docId);
    setBusy(false);
    setConfirmDoc(null);
    router.refresh();
  }
  async function doUnmap(docId: string) {
    setBusy(true);
    await unmapDocument(projectId, docId);
    setBusy(false);
    router.refresh();
  }
  function pick(d: MappableDoc) {
    if (d.visibility === "private") setConfirmDoc(d);
    else doMap(d.id);
  }

  return (
    <div className="mb-6 rounded-xl border border-neutral-200 bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-neutral-900">From the Wiki</div>
          <p className="text-xs text-neutral-500">Map workspace Wiki pages into this project so the AI grounds on them here.</p>
        </div>
        <button onClick={() => setPickerOpen(true)} className="shrink-0 rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800">Map from Wiki</button>
      </div>

      {mapped.length > 0 && (
        <ul className="mt-4 space-y-1">
          {mapped.map((d) => (
            <li key={d.id} className="group flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-neutral-50">
              <span>{d.icon || "📄"}</span>
              <Link href={`/wiki/${d.id}`} className="min-w-0 flex-1 truncate text-neutral-800 hover:underline">{d.title || "Untitled"}</Link>
              {d.visibility === "private" && <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-500">🔒 shared</span>}
              <button onClick={() => doUnmap(d.id)} disabled={busy} title="Remove from this project" className="rounded p-1 text-neutral-300 opacity-0 hover:bg-neutral-100 hover:text-neutral-700 group-hover:opacity-100">✕</button>
            </li>
          ))}
        </ul>
      )}

      {pickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setPickerOpen(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-neutral-900">Map a Wiki page</h2>
              <button onClick={() => setPickerOpen(false)} aria-label="Close" className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700">✕</button>
            </div>
            {mappable.length === 0 ? (
              <p className="py-4 text-center text-sm text-neutral-400">No more pages to map.</p>
            ) : (
              <ul className="max-h-80 space-y-0.5 overflow-y-auto">
                {mappable.map((d) => (
                  <li key={d.id}>
                    <button onClick={() => pick(d)} disabled={busy} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-neutral-50 disabled:opacity-50">
                      <span>{d.icon || "📄"}</span>
                      <span className="min-w-0 flex-1 truncate text-neutral-800">{d.title || "Untitled"}</span>
                      {d.visibility === "private" && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700">🔒 Private</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {confirmDoc && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={() => setConfirmDoc(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-semibold text-neutral-900">Share this private page?</h2>
            <p className="mt-1.5 text-sm text-neutral-500">
              Mapping <span className="font-medium text-neutral-800">&ldquo;{confirmDoc.title || "Untitled"}&rdquo;</span> makes this private page visible to this project&apos;s members.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setConfirmDoc(null)} disabled={busy} className="rounded-lg px-3 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100">Cancel</button>
              <button onClick={() => doMap(confirmDoc.id)} disabled={busy} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50">Share &amp; map</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
