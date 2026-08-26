"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { generatePlaybook, savePlaybookContent, approvePlaybook } from "../actions";

type Section = { key: string; heading: string; content: string; citations: string[] };
type Content = { summary: string; sections: Section[] };
type Playbook = {
  id: string;
  version: number;
  status: string;
  content: Content;
  groundedness: number | null;
  provider: string | null;
  model: string | null;
  edited: boolean;
};

export default function PlaybookClient({
  featureId,
  playbook,
  canWork,
}: {
  featureId: string;
  playbook: Playbook | null;
  canWork: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Content | null>(playbook?.content ?? null);

  const approved = playbook?.status === "approved";
  const content = editing ? draft : playbook?.content ?? null;

  async function generate() {
    setErr("");
    setBusy("gen");
    const r = await generatePlaybook(featureId);
    setBusy("");
    if (r?.error) return setErr(r.error);
    router.refresh();
  }

  async function save() {
    if (!playbook || !draft) return;
    setErr("");
    setBusy("save");
    const r = await savePlaybookContent(playbook.id, draft);
    setBusy("");
    if (r?.error) return setErr(r.error);
    setEditing(false);
    router.refresh();
  }

  async function approve() {
    if (!playbook) return;
    setErr("");
    setBusy("approve");
    const r = await approvePlaybook(playbook.id);
    setBusy("");
    if (r?.error) return setErr(r.error);
    router.refresh();
  }

  function patchSection(i: number, value: string) {
    setDraft((d) => (d ? { ...d, sections: d.sections.map((s, j) => (j === i ? { ...s, content: value } : s)) } : d));
  }

  const ta = "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900";

  if (!playbook || !content) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-10 text-center">
        <div className="text-lg font-medium">No playbook yet</div>
        <p className="mx-auto mt-1 max-w-md text-sm text-neutral-500">
          Aurume will draft a structured playbook grounded in this project&apos;s and your organization&apos;s knowledge.
          You review, edit, and approve — nothing is committed on your behalf.
        </p>
        {err && <p className="mt-3 text-sm text-red-700">{err}</p>}
        {canWork && (
          <button onClick={generate} disabled={busy === "gen"} className="mt-4 rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50">
            {busy === "gen" ? "Generating…" : "Generate playbook"}
          </button>
        )}
      </div>
    );
  }

  const g = playbook.groundedness ?? 0;
  const groundedTone = g >= 75 ? "bg-green-100 text-green-700" : g >= 40 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700";

  return (
    <div className="space-y-4">
      {/* status bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white px-5 py-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className={`rounded-full px-2 py-0.5 font-medium ${approved ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
            {approved ? "Approved" : "Draft"} · v{playbook.version}
          </span>
          <span className={`rounded-full px-2 py-0.5 font-medium ${groundedTone}`}>{g}% grounded</span>
          {playbook.model && <span className="text-neutral-400">{playbook.provider}/{playbook.model}</span>}
          {playbook.edited && <span className="text-neutral-400">· human-edited</span>}
        </div>
        {canWork && (
          <div className="flex items-center gap-2">
            {!approved && !editing && (
              <>
                <button onClick={() => { setDraft(playbook.content); setEditing(true); }} className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs hover:bg-neutral-50">Edit</button>
                <button onClick={approve} disabled={busy === "approve"} className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800 disabled:opacity-50">
                  {busy === "approve" ? "Approving…" : "Approve"}
                </button>
              </>
            )}
            {editing && (
              <>
                <button onClick={save} disabled={busy === "save"} className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800 disabled:opacity-50">
                  {busy === "save" ? "Saving…" : "Save"}
                </button>
                <button onClick={() => { setEditing(false); setDraft(playbook.content); }} className="text-xs text-neutral-500 hover:text-neutral-900">Cancel</button>
              </>
            )}
            <button onClick={generate} disabled={busy === "gen"} className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs hover:bg-neutral-50 disabled:opacity-50" title="Generate a new draft version">
              {busy === "gen" ? "…" : "Regenerate"}
            </button>
          </div>
        )}
      </div>

      {err && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      {g < 100 && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Groundedness is informational: sections without a citation are the model&apos;s own inference, not drawn from your
          knowledge base — review those closely before approving.
        </p>
      )}

      {/* summary */}
      <div className="rounded-xl border border-neutral-200 bg-white p-5">
        <div className="text-xs uppercase tracking-wide text-neutral-400">Summary</div>
        {editing ? (
          <textarea value={draft!.summary} onChange={(e) => setDraft((d) => (d ? { ...d, summary: e.target.value } : d))} rows={3} className={`${ta} mt-2`} />
        ) : (
          <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-800">{content.summary}</p>
        )}
      </div>

      {/* sections */}
      {content.sections.map((s, i) => (
        <div key={s.key} className="rounded-xl border border-neutral-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">{s.heading}</h3>
            {s.citations.length > 0 ? (
              <span className="text-[11px] text-neutral-400">cites {s.citations.join(", ")}</span>
            ) : (
              <span className="text-[11px] text-amber-600">ungrounded · model inference</span>
            )}
          </div>
          {editing ? (
            <textarea value={draft!.sections[i]?.content ?? ""} onChange={(e) => patchSection(i, e.target.value)} rows={5} className={`${ta} mt-2`} />
          ) : (
            <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-800">{s.content}</p>
          )}
        </div>
      ))}
    </div>
  );
}
