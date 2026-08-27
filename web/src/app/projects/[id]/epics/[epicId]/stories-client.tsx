"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateEpic, deleteEpic, generateStories, updateStory, deleteStory, setStoryApproved, assignStory, setStorySchedule } from "../actions";

export type StoryView = {
  id: string;
  title: string;
  userStory: string | null;
  acceptanceCriteria: string[];
  priority: string | null;
  points: number | null;
  status: string;
  citations: string[];
  sourceApproved: boolean;
  sourceVersion: string | null;
  assigneeId: string | null;
  startDate: string | null;
  endDate: string | null;
};
type Epic = { id: string; name: string; scopeDetail: string | null; jiraId: string | null; jiraUrl: string | null };
type Member = { userId: string; name: string };
type ModelInfo = { provider: string; options: string[]; defaultModel: string };

const field = "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900";
const cell = "rounded-md border border-neutral-300 px-2 py-1 text-sm outline-none focus:border-neutral-900";
const PRI: Record<string, { label: string; cls: string }> = {
  must: { label: "Must", cls: "bg-red-100 text-red-700" },
  should: { label: "Should", cls: "bg-amber-100 text-amber-700" },
  could: { label: "Could", cls: "bg-blue-100 text-blue-700" },
  wont: { label: "Won't", cls: "bg-neutral-100 text-neutral-500" },
};

export default function EpicDetail({
  projectId,
  epic,
  stories,
  members,
  canWork,
  modelInfo,
  playbookApproved,
  playbookLabel,
}: {
  projectId: string;
  epic: Epic;
  stories: StoryView[];
  members: Member[];
  canWork: boolean;
  modelInfo: ModelInfo;
  playbookApproved: boolean;
  playbookLabel: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [model, setModel] = useState(modelInfo.options.includes(modelInfo.defaultModel) ? modelInfo.defaultModel : modelInfo.options[0] ?? "");

  // epic edit
  const [ee, setEe] = useState(false);
  const [en, setEn] = useState(epic.name);
  const [es, setEs] = useState(epic.scopeDetail ?? "");
  const [ej, setEj] = useState(epic.jiraId ?? "");
  const [eu, setEu] = useState(epic.jiraUrl ?? "");

  // story edit
  const [editId, setEditId] = useState("");
  const [sTitle, setSTitle] = useState("");
  const [sStory, setSStory] = useState("");
  const [sAC, setSAC] = useState("");
  const [sPri, setSPri] = useState("should");
  const [sPts, setSPts] = useState("");
  const [sStart, setSStart] = useState("");
  const [sEnd, setSEnd] = useState("");

  async function run(key: string, fn: () => Promise<{ error?: string } | void>, after?: () => void) {
    setErr("");
    setBusy(key);
    const r = await fn();
    setBusy("");
    if (r && "error" in r && r.error) return setErr(r.error);
    after?.();
    router.refresh();
  }

  function startEdit(s: StoryView) {
    setEditId(s.id);
    setSTitle(s.title);
    setSStory(s.userStory ?? "");
    setSAC(s.acceptanceCriteria.join("\n"));
    setSPri(s.priority ?? "should");
    setSPts(s.points != null ? String(s.points) : "");
    setSStart(s.startDate ? s.startDate.slice(0, 10) : "");
    setSEnd(s.endDate ? s.endDate.slice(0, 10) : "");
  }

  async function saveStory(id: string) {
    await run(`save-${id}`, async () => {
      const r1 = await updateStory(id, { title: sTitle, userStory: sStory, acceptanceCriteria: sAC.split("\n"), priority: sPri, points: sPts.trim() ? Math.round(Number(sPts)) : null });
      if (r1?.error) return r1;
      return setStorySchedule(id, sStart || null, sEnd || null);
    }, () => setEditId(""));
  }

  return (
    <div>
      {/* epic header */}
      <div className="rounded-xl border border-neutral-200 bg-white p-6">
        {ee ? (
          <div className="space-y-2">
            <input value={en} onChange={(e) => setEn(e.target.value)} className={field} placeholder="Epic name" />
            <textarea value={es} onChange={(e) => setEs(e.target.value)} rows={3} className={field} placeholder="Scope detail" />
            <div className="flex gap-2">
              <input value={ej} onChange={(e) => setEj(e.target.value)} className={`${cell} w-32`} placeholder="Jira id" />
              <input value={eu} onChange={(e) => setEu(e.target.value)} className={`${cell} flex-1`} placeholder="Jira URL" />
            </div>
            <div className="flex gap-2">
              <button disabled={busy === "epic" || !en.trim()} onClick={() => run("epic", () => updateEpic(epic.id, { name: en, scopeDetail: es, jiraId: ej, jiraUrl: eu }), () => setEe(false))} className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800 disabled:opacity-50">Save</button>
              <button onClick={() => setEe(false)} className="text-xs text-neutral-500 hover:text-neutral-900">Cancel</button>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-semibold">{epic.name}</h1>
                {epic.jiraId && (epic.jiraUrl ? <a href={epic.jiraUrl} target="_blank" rel="noreferrer" className="rounded bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700 hover:underline">{epic.jiraId}</a> : <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700">{epic.jiraId}</span>)}
              </div>
              {epic.scopeDetail && <p className="mt-2 text-sm text-neutral-600">{epic.scopeDetail}</p>}
            </div>
            {canWork && (
              <div className="flex shrink-0 gap-2">
                <button onClick={() => setEe(true)} className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs hover:bg-neutral-50">Edit</button>
                <button onClick={() => run("delepic", () => deleteEpic(epic.id), () => router.push(`/projects/${projectId}/epics`))} className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs hover:bg-neutral-50">Delete</button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* generation bar */}
      {canWork && (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-neutral-200 bg-white px-5 py-3">
          <span className="text-sm font-medium">Stories ({stories.length})</span>
          <div className="ml-auto flex items-center gap-2">
            {modelInfo.options.length > 0 && (
              <select value={model} onChange={(e) => setModel(e.target.value)} className="rounded-md border border-neutral-300 px-2 py-1 text-xs outline-none focus:border-neutral-900" title="Model">
                {modelInfo.options.map((mo) => <option key={mo} value={mo}>{mo}</option>)}
              </select>
            )}
            <button disabled={busy === "gen"} onClick={() => run("gen", () => generateStories(epic.id, model))} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50">
              {busy === "gen" ? "Generating…" : stories.length ? "Generate more stories" : "Generate stories"}
            </button>
          </div>
        </div>
      )}

      {err && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      {!playbookApproved && (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          The product playbook is not fully approved ({playbookLabel ?? "draft"}). Stories generated now are grounded in an
          unapproved playbook — the lineage records that. Approve the playbook for a clean chain.
        </p>
      )}

      {/* stories */}
      <div className="mt-4 space-y-3">
        {stories.length === 0 && <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-10 text-center text-sm text-neutral-400">No stories yet. Generate them from the playbook &amp; knowledge.</div>}
        {stories.map((s) => {
          const approved = s.status === "approved";
          const pri = s.priority ? PRI[s.priority] : null;
          return (
            <div key={s.id} className="rounded-xl border border-neutral-200 bg-white p-5">
              {editId === s.id ? (
                <div className="space-y-2">
                  <input value={sTitle} onChange={(e) => setSTitle(e.target.value)} className={field} placeholder="Title" />
                  <textarea value={sStory} onChange={(e) => setSStory(e.target.value)} rows={2} className={field} placeholder="As a …, I want …, so that …" />
                  <textarea value={sAC} onChange={(e) => setSAC(e.target.value)} rows={4} className={field} placeholder="Acceptance criteria — one per line (Given/When/Then)" />
                  <div className="flex flex-wrap items-center gap-2">
                    <select value={sPri} onChange={(e) => setSPri(e.target.value)} className={cell}>
                      <option value="must">Must</option><option value="should">Should</option><option value="could">Could</option><option value="wont">Won&apos;t</option>
                    </select>
                    <input value={sPts} onChange={(e) => setSPts(e.target.value)} type="number" min="0" className={`${cell} w-20`} placeholder="Points" />
                    <span className="text-xs text-neutral-400">Pin dates (optional):</span>
                    <input value={sStart} onChange={(e) => setSStart(e.target.value)} type="date" className={cell} title="Manual start (overrides auto-schedule)" />
                    <input value={sEnd} onChange={(e) => setSEnd(e.target.value)} type="date" className={cell} title="Manual end" />
                  </div>
                  <div className="flex gap-2">
                    <button disabled={busy === `save-${s.id}` || !sTitle.trim()} onClick={() => saveStory(s.id)} className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800 disabled:opacity-50">Save</button>
                    <button onClick={() => setEditId("")} className="text-xs text-neutral-500 hover:text-neutral-900">Cancel</button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${approved ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>{approved ? "Approved" : "Draft"}</span>
                      {pri && <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${pri.cls}`}>{pri.label}</span>}
                      {s.points != null && <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-600">{s.points} pts</span>}
                      {s.startDate && s.endDate && <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-medium text-indigo-700" title="Manually pinned dates">📌 pinned</span>}
                      <span className="font-medium">{s.title}</span>
                    </div>
                    {canWork ? (
                      <div className="flex items-center gap-2 text-xs">
                        <select value={s.assigneeId ?? ""} onChange={(e) => run(`asg-${s.id}`, () => assignStory(s.id, e.target.value || null))} className="rounded-md border border-neutral-300 px-2 py-1 text-xs outline-none focus:border-neutral-900" title="Assignee">
                          <option value="">Unassigned</option>
                          {members.map((mem) => <option key={mem.userId} value={mem.userId}>{mem.name}</option>)}
                        </select>
                        <button onClick={() => startEdit(s)} className="text-neutral-500 hover:text-neutral-900">Edit</button>
                        <button disabled={busy === `appr-${s.id}`} onClick={() => run(`appr-${s.id}`, () => setStoryApproved(s.id, !approved))} className="rounded-md border border-neutral-300 px-2.5 py-1 hover:bg-neutral-50 disabled:opacity-50">{approved ? "Reopen" : "Approve"}</button>
                        <button onClick={() => run(`del-${s.id}`, () => deleteStory(s.id))} className="text-neutral-500 hover:text-red-700">Delete</button>
                      </div>
                    ) : (
                      s.assigneeId && <span className="text-xs text-neutral-500">{members.find((mm) => mm.userId === s.assigneeId)?.name ?? "assigned"}</span>
                    )}
                  </div>
                  {s.userStory && <p className="mt-2 text-sm italic text-neutral-700">{s.userStory}</p>}
                  {s.acceptanceCriteria.length > 0 && (
                    <div className="mt-2">
                      <div className="text-[11px] uppercase tracking-wide text-neutral-400">Acceptance criteria</div>
                      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-neutral-800">
                        {s.acceptanceCriteria.map((a, i) => <li key={i}>{a}</li>)}
                      </ul>
                    </div>
                  )}
                  {s.citations.length > 0 && <div className="mt-2 text-[11px] text-neutral-400">cites {s.citations.join(", ")}</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
