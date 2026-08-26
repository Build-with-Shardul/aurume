"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createFeature,
  updateFeature,
  deleteFeature,
  generateProductPlaybook,
  savePlaybookContent,
  setPlaybookApprover,
  approvePlaybook,
} from "./actions";

type Feature = { id: string; title: string; brief: string | null };
type Section = { key: string; heading: string; content: string; citations: string[] };
type Content = { summary: string; sections: Section[] };
export type PlaybookView = {
  id: string;
  version: number;
  status: string;
  stale: boolean;
  content: Content;
  groundedness: number | null;
  provider: string | null;
  model: string | null;
  edited: boolean;
  approverId: string | null;
  approverName: string | null;
  canApprove: boolean;
};
type Member = { userId: string; name: string | null; email: string };

const field = "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900";

export default function PlaybookWorkspace({
  projectId,
  features,
  playbook,
  members,
  canWork,
}: {
  projectId: string;
  features: Feature[];
  playbook: PlaybookView | null;
  members: Member[];
  canWork: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  // feature add / edit
  const [addOpen, setAddOpen] = useState(false);
  const [aTitle, setATitle] = useState("");
  const [aBrief, setABrief] = useState("");
  const [editId, setEditId] = useState("");
  const [eTitle, setETitle] = useState("");
  const [eBrief, setEBrief] = useState("");

  // playbook edit
  const [pbEditing, setPbEditing] = useState(false);
  const [draft, setDraft] = useState<Content | null>(null);

  async function run(key: string, fn: () => Promise<{ error?: string } | void>, after?: () => void) {
    setErr("");
    setBusy(key);
    const r = await fn();
    setBusy("");
    if (r && "error" in r && r.error) return setErr(r.error);
    after?.();
    router.refresh();
  }

  const approved = playbook?.status === "approved";
  const content = pbEditing ? draft : playbook?.content ?? null;
  const g = playbook?.groundedness ?? 0;
  const gTone = g >= 75 ? "bg-green-100 text-green-700" : g >= 40 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700";

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-[300px_1fr]">
      {/* LEFT: features */}
      <aside>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Features ({features.length})</h2>
          {canWork && !addOpen && (
            <button onClick={() => setAddOpen(true)} className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs hover:bg-neutral-50">+ Add</button>
          )}
        </div>

        {addOpen && (
          <div className="mt-3 rounded-xl border border-neutral-200 bg-white p-3">
            <input value={aTitle} onChange={(e) => setATitle(e.target.value)} placeholder="Feature title" className={field} />
            <textarea value={aBrief} onChange={(e) => setABrief(e.target.value)} rows={2} placeholder="One-line brief (optional)" className={`${field} mt-2`} />
            <div className="mt-2 flex gap-2">
              <button
                disabled={busy === "add" || !aTitle.trim()}
                onClick={() => run("add", () => createFeature(projectId, aTitle, aBrief), () => { setATitle(""); setABrief(""); setAddOpen(false); })}
                className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
              >
                {busy === "add" ? "Adding…" : "Add feature"}
              </button>
              <button onClick={() => setAddOpen(false)} className="text-xs text-neutral-500 hover:text-neutral-900">Cancel</button>
            </div>
          </div>
        )}

        <ul className="mt-3 space-y-2">
          {features.length === 0 && !addOpen && <li className="rounded-lg border border-dashed border-neutral-300 px-3 py-4 text-center text-xs text-neutral-400">No features yet.</li>}
          {features.map((f) => (
            <li key={f.id} className="rounded-xl border border-neutral-200 bg-white p-3">
              {editId === f.id ? (
                <div>
                  <input value={eTitle} onChange={(e) => setETitle(e.target.value)} className={field} />
                  <textarea value={eBrief} onChange={(e) => setEBrief(e.target.value)} rows={2} className={`${field} mt-2`} />
                  <div className="mt-2 flex gap-2">
                    <button disabled={busy === `edit-${f.id}` || !eTitle.trim()} onClick={() => run(`edit-${f.id}`, () => updateFeature(f.id, eTitle, eBrief), () => setEditId(""))} className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800 disabled:opacity-50">Save</button>
                    <button onClick={() => setEditId("")} className="text-xs text-neutral-500 hover:text-neutral-900">Cancel</button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{f.title}</div>
                      {f.brief && <p className="mt-0.5 text-xs text-neutral-500">{f.brief}</p>}
                    </div>
                  </div>
                  {canWork && (
                    <div className="mt-2 flex gap-3 text-xs">
                      <button onClick={() => { setEditId(f.id); setETitle(f.title); setEBrief(f.brief ?? ""); }} className="text-neutral-500 hover:text-neutral-900">Edit</button>
                      <button disabled={busy === `del-${f.id}`} onClick={() => run(`del-${f.id}`, () => deleteFeature(f.id))} className="text-neutral-500 hover:text-red-700 disabled:opacity-50">Remove</button>
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      </aside>

      {/* RIGHT: product playbook */}
      <section>
        {err && <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}

        {!playbook || !content ? (
          <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-10 text-center">
            <div className="text-lg font-medium">No product playbook yet</div>
            <p className="mx-auto mt-1 max-w-md text-sm text-neutral-500">One grounded, structured playbook for this product — synthesized from its features and your knowledge. You review, assign an approver, and approve.</p>
            {canWork && (
              <button disabled={busy === "gen"} onClick={() => run("gen", () => generateProductPlaybook(projectId))} className="mt-4 rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50">
                {busy === "gen" ? "Generating…" : "Generate product playbook"}
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {/* status bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white px-5 py-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className={`rounded-full px-2 py-0.5 font-medium ${approved ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>{approved ? "Approved" : "Draft"} · v{playbook.version}</span>
                <span className={`rounded-full px-2 py-0.5 font-medium ${gTone}`}>{g}% grounded</span>
                {playbook.stale && <span className="rounded-full bg-orange-100 px-2 py-0.5 font-medium text-orange-700">Out of date</span>}
                {playbook.model && <span className="text-neutral-400">{playbook.provider}/{playbook.model}</span>}
                {playbook.edited && <span className="text-neutral-400">· human-edited</span>}
              </div>
              {canWork && (
                <div className="flex items-center gap-2">
                  {!pbEditing && !approved && <button onClick={() => { setDraft(playbook.content); setPbEditing(true); }} className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs hover:bg-neutral-50">Edit</button>}
                  {pbEditing && (
                    <>
                      <button disabled={busy === "save"} onClick={() => draft && run("save", () => savePlaybookContent(playbook.id, draft), () => setPbEditing(false))} className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800 disabled:opacity-50">{busy === "save" ? "Saving…" : "Save"}</button>
                      <button onClick={() => { setPbEditing(false); setDraft(null); }} className="text-xs text-neutral-500 hover:text-neutral-900">Cancel</button>
                    </>
                  )}
                  <button disabled={busy === "gen"} onClick={() => run("gen", () => generateProductPlaybook(projectId))} className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs hover:bg-neutral-50 disabled:opacity-50" title="Generate a new version from the current features + knowledge">{busy === "gen" ? "…" : playbook.stale ? "Update playbook" : "Regenerate"}</button>
                </div>
              )}
            </div>

            {playbook.stale && <p className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-800">Features or knowledge changed since this version. Click <strong>Update playbook</strong> to regenerate.</p>}
            {g < 100 && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">Groundedness is informational: sections without a citation are the model&apos;s own inference — review those closely before approving.</p>}

            {/* approver + approve */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white px-5 py-3">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-neutral-500">Approver:</span>
                {canWork ? (
                  <select value={playbook.approverId ?? ""} onChange={(e) => run("approver", () => setPlaybookApprover(playbook.id, e.target.value || null))} className="rounded-md border border-neutral-300 px-2 py-1 text-sm outline-none focus:border-neutral-900">
                    <option value="">— unassigned —</option>
                    {members.map((mem) => (
                      <option key={mem.userId} value={mem.userId}>{mem.name || mem.email}</option>
                    ))}
                  </select>
                ) : (
                  <span className="font-medium">{playbook.approverName ?? "unassigned"}</span>
                )}
              </div>
              {!approved &&
                (playbook.canApprove ? (
                  <button disabled={busy === "approve"} onClick={() => run("approve", () => approvePlaybook(playbook.id))} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50">{busy === "approve" ? "Approving…" : "Approve playbook"}</button>
                ) : (
                  <span className="text-xs text-neutral-500">Waiting on {playbook.approverName ?? "an approver"} to approve</span>
                ))}
            </div>

            {/* preview */}
            <div className="rounded-xl border border-neutral-200 bg-white p-5">
              <div className="text-xs uppercase tracking-wide text-neutral-400">Summary</div>
              {pbEditing ? (
                <textarea value={draft!.summary} onChange={(e) => setDraft((d) => (d ? { ...d, summary: e.target.value } : d))} rows={3} className={`${field} mt-2`} />
              ) : (
                <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-800">{content.summary}</p>
              )}
            </div>
            {content.sections.map((s, i) => (
              <div key={s.key} className="rounded-xl border border-neutral-200 bg-white p-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">{s.heading}</h3>
                  {s.citations.length > 0 ? <span className="text-[11px] text-neutral-400">cites {s.citations.join(", ")}</span> : <span className="text-[11px] text-amber-600">ungrounded · model inference</span>}
                </div>
                {pbEditing ? (
                  <textarea value={draft!.sections[i]?.content ?? ""} onChange={(e) => setDraft((d) => (d ? { ...d, sections: d.sections.map((x, j) => (j === i ? { ...x, content: e.target.value } : x)) } : d))} rows={5} className={`${field} mt-2`} />
                ) : (
                  <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-800">{s.content}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
