"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { mapDiagramToProject, unmapDiagramFromProject } from "../actions";

export type ProjectOption = { id: string; name: string; mapped: boolean };

export default function DiagramProjectsPanel({ diagramId, options, onClose }: { diagramId: string; options: ProjectOption[]; onClose: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function toggle(o: ProjectOption) {
    if (busy) return;
    setBusy(true);
    if (o.mapped) await unmapDiagramFromProject(diagramId, o.id);
    else await mapDiagramToProject(diagramId, o.id);
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-900">Add to a project</h2>
          <button onClick={onClose} aria-label="Close" className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700">✕</button>
        </div>
        <p className="mb-2 text-xs text-neutral-400">Mapping a diagram into a project adds it to that project&apos;s knowledge base.</p>
        {options.length === 0 ? (
          <p className="px-1 py-2 text-sm text-neutral-400">You&apos;re not a member of any projects yet.</p>
        ) : (
          <ul className="max-h-72 space-y-0.5 overflow-y-auto">
            {options.map((o) => (
              <li key={o.id}>
                <button onClick={() => toggle(o)} disabled={busy} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-neutral-50 disabled:opacity-50">
                  <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${o.mapped ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300"}`}>{o.mapped ? "✓" : ""}</span>
                  <span className="min-w-0 flex-1 truncate text-neutral-800">{o.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
