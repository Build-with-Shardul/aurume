"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createEpicsFromPlaybook, createEpic } from "./actions";

type Item = {
  id: string;
  name: string;
  scopeDetail: string | null;
  jiraId: string | null;
  stories: { total: number; approved: number; points: number };
};

const field = "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900";

export default function EpicsClient({
  projectId,
  items,
  canWork,
  hasPlaybook,
  playbookLabel,
}: {
  projectId: string;
  items: Item[];
  canWork: boolean;
  hasPlaybook: boolean;
  playbookLabel: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [scope, setScope] = useState("");

  async function run(key: string, fn: () => Promise<{ error?: string; created?: number } | void>, after?: () => void) {
    setErr("");
    setMsg("");
    setBusy(key);
    const r = await fn();
    setBusy("");
    if (r && "error" in r && r.error) return setErr(r.error);
    if (r && "created" in r && typeof r.created === "number") setMsg(r.created ? `Added ${r.created} epic${r.created === 1 ? "" : "s"} from the playbook.` : "No new epics to add — they already exist.");
    after?.();
    router.refresh();
  }

  return (
    <div>
      {canWork && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button
            disabled={!hasPlaybook || busy === "promote"}
            onClick={() => run("promote", () => createEpicsFromPlaybook(projectId))}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
            title={hasPlaybook ? "Promote the playbook's in-scope epics into editable epics" : "Generate a product playbook first"}
          >
            Create epics from playbook
          </button>
          {playbookLabel && <span className="text-xs text-neutral-400">Source: {playbookLabel}</span>}
          <button onClick={() => setOpen((v) => !v)} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-white">+ New epic</button>
        </div>
      )}

      {err && <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      {msg && <p className="mb-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{msg}</p>}

      {open && (
        <div className="mb-4 rounded-xl border border-neutral-200 bg-white p-4">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Epic name" className={field} />
          <textarea value={scope} onChange={(e) => setScope(e.target.value)} rows={2} placeholder="Scope detail (optional)" className={`${field} mt-2`} />
          <div className="mt-2 flex gap-2">
            <button disabled={busy === "add" || !name.trim()} onClick={() => run("add", () => createEpic(projectId, name, scope), () => { setName(""); setScope(""); setOpen(false); })} className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800 disabled:opacity-50">Add epic</button>
            <button onClick={() => setOpen(false)} className="text-xs text-neutral-500 hover:text-neutral-900">Cancel</button>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-neutral-200 bg-white">
        {items.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-neutral-400">
            No epics yet. {hasPlaybook ? "Create them from the playbook or add one manually." : "Generate a product playbook first, then create epics from it."}
          </p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {items.map((e) => (
              <li key={e.id}>
                <Link href={`/projects/${projectId}/epics/${e.id}`} className="flex items-center justify-between gap-3 px-6 py-4 hover:bg-neutral-50">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{e.name}</span>
                      {e.jiraId && <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[11px] font-medium text-blue-700">{e.jiraId}</span>}
                    </div>
                    {e.scopeDetail && <p className="mt-0.5 line-clamp-1 text-sm text-neutral-500">{e.scopeDetail}</p>}
                  </div>
                  <div className="shrink-0 text-right text-xs text-neutral-500">
                    {e.stories.total === 0 ? (
                      <span className="text-neutral-400">No stories</span>
                    ) : (
                      <>
                        <div className="font-medium text-neutral-800">{e.stories.total} stor{e.stories.total === 1 ? "y" : "ies"} · {e.stories.points} pts</div>
                        <div className="text-neutral-400">{e.stories.approved} approved</div>
                      </>
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
