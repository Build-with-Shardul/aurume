"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createDiagram, deleteDiagram } from "./actions";
import type { DiagramCard } from "@/lib/diagrams";
import ConfirmDialog from "../wiki/confirm-dialog";

// SVG previews are rendered via <img> (data URI) so any markup in the exported SVG
// can never execute scripts in our page.
function svgSrc(p: string) {
  return p.startsWith("data:") ? p : "data:image/svg+xml;utf8," + encodeURIComponent(p);
}

export default function DiagramsList({ diagrams }: { diagrams: DiagramCard[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<{ id: string; title: string } | null>(null);
  const [delBusy, setDelBusy] = useState(false);

  async function create() {
    if (busy) return;
    setBusy(true);
    const r = await createDiagram();
    setBusy(false);
    if (r && "id" in r && r.id) router.push(`/diagrams/${r.id}`);
  }

  async function confirmDelete() {
    if (!confirm) return;
    setDelBusy(true);
    await deleteDiagram(confirm.id);
    setDelBusy(false);
    setConfirm(null);
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-5xl px-8 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">Diagrams</h1>
          <p className="text-sm text-neutral-400">Flowcharts, architecture, and more powered by draw.io.</p>
        </div>
        <button onClick={create} disabled={busy} className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50">
          New diagram
        </button>
      </div>

      {diagrams.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-300 px-6 py-16 text-center">
          <div className="text-3xl">🗺️</div>
          <p className="mt-2 text-sm font-medium text-neutral-800">No diagrams yet</p>
          <p className="mt-1 text-sm text-neutral-400">Create your first diagram to sketch a flow or architecture.</p>
          <button onClick={create} disabled={busy} className="mt-4 rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50">
            New diagram
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {diagrams.map((d) => (
            <div key={d.id} className="group relative">
              <Link href={`/diagrams/${d.id}`} className="block overflow-hidden rounded-xl border border-neutral-200 bg-white transition-shadow hover:shadow-md">
                <div className="flex h-32 items-center justify-center bg-neutral-50 p-2">
                  {d.preview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={svgSrc(d.preview)} alt="" className="max-h-full max-w-full object-contain" />
                  ) : (
                    <span className="text-2xl text-neutral-300">🗺️</span>
                  )}
                </div>
                <div className="border-t border-neutral-100 px-3 py-2">
                  <div className="truncate text-sm font-medium text-neutral-800">{d.title}</div>
                  <div className="mt-0.5 truncate text-xs text-neutral-400">{d.authorName ? `Edited by ${d.authorName}` : "Not edited yet"}</div>
                </div>
              </Link>
              <button
                onClick={() => setConfirm({ id: d.id, title: d.title })}
                title="Delete diagram"
                className="absolute right-2 top-2 hidden rounded-md bg-white/90 px-2 py-1 text-xs text-neutral-500 shadow-sm hover:text-red-600 group-hover:block"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!confirm}
        title="Delete diagram?"
        message={`"${confirm?.title || "Untitled diagram"}" will be permanently deleted. This can't be undone.`}
        busy={delBusy}
        onConfirm={confirmDelete}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
