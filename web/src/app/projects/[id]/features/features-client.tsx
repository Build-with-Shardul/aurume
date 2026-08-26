"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createFeature } from "./actions";

type Item = {
  id: string;
  title: string;
  brief: string | null;
  playbook: { status: string; groundedness: number | null; version: number } | null;
};

export default function FeaturesClient({ projectId, items, canWork }: { projectId: string; items: Item[]; canWork: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function create() {
    setErr("");
    setBusy(true);
    const r = await createFeature(projectId, title, brief);
    setBusy(false);
    if (r?.error) return setErr(r.error);
    setTitle("");
    setBrief("");
    setOpen(false);
    if (r?.id) router.push(`/projects/${projectId}/features/${r.id}`);
    else router.refresh();
  }

  return (
    <div>
      {canWork && (
        <div className="mb-4">
          {open ? (
            <div className="rounded-xl border border-neutral-200 bg-white p-4">
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Feature title" className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900" />
              <textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={2} placeholder="One-line brief — the problem or initiative (optional)" className="mt-2 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900" />
              {err && <p className="mt-2 text-sm text-red-700">{err}</p>}
              <div className="mt-2 flex gap-2">
                <button onClick={create} disabled={busy || !title.trim()} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50">
                  {busy ? "Creating…" : "Create feature"}
                </button>
                <button onClick={() => setOpen(false)} className="text-sm text-neutral-500 hover:text-neutral-900">Cancel</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setOpen(true)} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800">
              + New feature
            </button>
          )}
        </div>
      )}

      <div className="rounded-xl border border-neutral-200 bg-white">
        {items.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-neutral-400">No features yet. Create one to draft its playbook.</p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {items.map((f) => (
              <li key={f.id}>
                <Link href={`/projects/${projectId}/features/${f.id}`} className="flex items-center justify-between gap-3 px-6 py-4 hover:bg-neutral-50">
                  <div className="min-w-0">
                    <div className="font-medium">{f.title}</div>
                    {f.brief && <p className="mt-0.5 line-clamp-1 text-sm text-neutral-500">{f.brief}</p>}
                  </div>
                  <div className="shrink-0 text-right text-xs">
                    {f.playbook ? (
                      <>
                        <span className={`rounded-full px-2 py-0.5 font-medium ${f.playbook.status === "approved" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                          {f.playbook.status === "approved" ? "Playbook approved" : "Draft"}
                        </span>
                        {f.playbook.groundedness != null && <div className="mt-1 text-neutral-400">{f.playbook.groundedness}% grounded</div>}
                      </>
                    ) : (
                      <span className="text-neutral-400">No playbook yet</span>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
