"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DISCIPLINE_LABEL } from "@/lib/permissions";
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
type Stakeholder = { name: string; team: string; projectRole: string };
type Milestone = { milestone: string; targetDate: string };
type Epic = { jiraId: string; jiraUrl: string; name: string; scopeDetail: string };
type Kpi = { metric: string; targetValue: string; measurementStrategy: string };
type Content = {
  projectSummary: string;
  keyHypothesis: string;
  projectType: "test" | "scale";
  techStakeholders: Stakeholder[];
  businessStakeholders: Stakeholder[];
  milestones: Milestone[];
  inScopeEpics: Epic[];
  adoptionMarkets: string[];
  futureScope: string;
  kpis: Kpi[];
  operationalChangeManagement: string;
  citations: string[];
};
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
type Member = { userId: string; name: string | null; email: string; discipline: string | null };

const field = "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900";
const cell = "rounded-md border border-neutral-300 px-2 py-1 text-sm outline-none focus:border-neutral-900";
const th = "px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-neutral-400";
const td = "px-3 py-2 align-top text-sm text-neutral-800";

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="mt-3">{children}</div>
    </div>
  );
}

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
  const [addOpen, setAddOpen] = useState(false);
  const [aTitle, setATitle] = useState("");
  const [aBrief, setABrief] = useState("");
  const [editId, setEditId] = useState("");
  const [eTitle, setETitle] = useState("");
  const [eBrief, setEBrief] = useState("");
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
  const view = pbEditing ? draft : playbook?.content ?? null;
  const g = playbook?.groundedness ?? 0;
  const gTone = g >= 75 ? "bg-green-100 text-green-700" : g >= 40 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700";

  // draft mutation helpers
  function up(patch: Partial<Content>) {
    setDraft((d) => (d ? { ...d, ...patch } : d));
  }
  function memberTeam(mem: Member) {
    return mem.discipline ? DISCIPLINE_LABEL[mem.discipline] ?? mem.discipline : "";
  }

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-[300px_1fr]">
      {/* LEFT: features */}
      <aside>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Features ({features.length})</h2>
          {canWork && !addOpen && <button onClick={() => setAddOpen(true)} className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs hover:bg-neutral-50">+ Add</button>}
        </div>
        {addOpen && (
          <div className="mt-3 rounded-xl border border-neutral-200 bg-white p-3">
            <input value={aTitle} onChange={(e) => setATitle(e.target.value)} placeholder="Feature title" className={field} />
            <textarea value={aBrief} onChange={(e) => setABrief(e.target.value)} rows={2} placeholder="One-line brief (optional)" className={`${field} mt-2`} />
            <div className="mt-2 flex gap-2">
              <button disabled={busy === "add" || !aTitle.trim()} onClick={() => run("add", () => createFeature(projectId, aTitle, aBrief), () => { setATitle(""); setABrief(""); setAddOpen(false); })} className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800 disabled:opacity-50">{busy === "add" ? "Adding…" : "Add feature"}</button>
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
                  <div className="text-sm font-medium">{f.title}</div>
                  {f.brief && <p className="mt-0.5 text-xs text-neutral-500">{f.brief}</p>}
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

        {!playbook || !view ? (
          <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-10 text-center">
            <div className="text-lg font-medium">No product playbook yet</div>
            <p className="mx-auto mt-1 max-w-md text-sm text-neutral-500">One grounded, structured product playbook — synthesized from this product&apos;s features and your knowledge. You review, assign an approver, and approve.</p>
            {canWork && <button disabled={busy === "gen"} onClick={() => run("gen", () => generateProductPlaybook(projectId))} className="mt-4 rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50">{busy === "gen" ? "Generating…" : "Generate product playbook"}</button>}
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
                  <button disabled={busy === "gen"} onClick={() => run("gen", () => generateProductPlaybook(projectId))} className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs hover:bg-neutral-50 disabled:opacity-50">{busy === "gen" ? "…" : playbook.stale ? "Update playbook" : "Regenerate"}</button>
                </div>
              )}
            </div>

            {playbook.stale && <p className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-800">Features or knowledge changed since this version. Click <strong>Update playbook</strong> to regenerate.</p>}

            {/* approver + approve */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white px-5 py-3">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-neutral-500">Approver:</span>
                {canWork ? (
                  <select value={playbook.approverId ?? ""} onChange={(e) => run("approver", () => setPlaybookApprover(playbook.id, e.target.value || null))} className={cell}>
                    <option value="">— unassigned —</option>
                    {members.map((mem) => <option key={mem.userId} value={mem.userId}>{mem.name || mem.email}</option>)}
                  </select>
                ) : (
                  <span className="font-medium">{playbook.approverName ?? "unassigned"}</span>
                )}
              </div>
              {!approved && (playbook.canApprove ? (
                <button disabled={busy === "approve"} onClick={() => run("approve", () => approvePlaybook(playbook.id))} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50">{busy === "approve" ? "Approving…" : "Approve playbook"}</button>
              ) : (
                <span className="text-xs text-neutral-500">Waiting on {playbook.approverName ?? "an approver"} to approve</span>
              ))}
            </div>

            {/* ---- Summary & Key Hypothesis ---- */}
            <Block title="Summary & key hypothesis">
              <div className="text-xs uppercase tracking-wide text-neutral-400">Project summary</div>
              {pbEditing ? <textarea value={draft!.projectSummary} onChange={(e) => up({ projectSummary: e.target.value })} rows={3} className={`${field} mt-1`} /> : <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-800">{view.projectSummary || "—"}</p>}
              <div className="mt-4 text-xs uppercase tracking-wide text-neutral-400">Key hypothesis</div>
              {pbEditing ? <textarea value={draft!.keyHypothesis} onChange={(e) => up({ keyHypothesis: e.target.value })} rows={3} className={`${field} mt-1`} /> : <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-800">{view.keyHypothesis || "—"}</p>}
            </Block>

            {/* ---- Test / Scale ---- */}
            <Block title="Test or scale">
              {pbEditing ? (
                <select value={draft!.projectType} onChange={(e) => up({ projectType: e.target.value as "test" | "scale" })} className={cell}>
                  <option value="test">Test — a new feature to validate</option>
                  <option value="scale">Scale — an existing feature to scale</option>
                </select>
              ) : (
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${view.projectType === "scale" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"}`}>
                  {view.projectType === "scale" ? "Scale — existing feature to scale" : "Test — new feature to validate"}
                </span>
              )}
            </Block>

            {/* ---- Stakeholder tables ---- */}
            {(["techStakeholders", "businessStakeholders"] as const).map((keyName) => {
              const label = keyName === "techStakeholders" ? "Key technology stakeholders" : "Key business stakeholders";
              const rows = view[keyName];
              return (
                <Block key={keyName} title={label}>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead><tr className="border-b border-neutral-100"><th className={th}>Name</th><th className={th}>Team</th><th className={th}>Project role</th>{pbEditing && <th className={th}></th>}</tr></thead>
                      <tbody>
                        {rows.length === 0 && !pbEditing && <tr><td className={`${td} text-neutral-400`} colSpan={3}>None selected.</td></tr>}
                        {rows.map((s, i) => (
                          <tr key={i} className="border-b border-neutral-50">
                            {pbEditing ? (
                              <>
                                <td className={td}><input value={s.name} onChange={(e) => up({ [keyName]: draft![keyName].map((x, j) => j === i ? { ...x, name: e.target.value } : x) } as Partial<Content>)} className={`${cell} w-full`} /></td>
                                <td className={td}><input value={s.team} onChange={(e) => up({ [keyName]: draft![keyName].map((x, j) => j === i ? { ...x, team: e.target.value } : x) } as Partial<Content>)} className={`${cell} w-full`} /></td>
                                <td className={td}><input value={s.projectRole} onChange={(e) => up({ [keyName]: draft![keyName].map((x, j) => j === i ? { ...x, projectRole: e.target.value } : x) } as Partial<Content>)} className={`${cell} w-full`} /></td>
                                <td className={td}><button onClick={() => up({ [keyName]: draft![keyName].filter((_, j) => j !== i) } as Partial<Content>)} className="text-xs text-neutral-400 hover:text-red-700">✕</button></td>
                              </>
                            ) : (
                              <><td className={td}>{s.name}</td><td className={td}>{s.team}</td><td className={td}>{s.projectRole}</td></>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {pbEditing && (
                    <div className="mt-2">
                      <select value="" onChange={(e) => { const mem = members.find((mm) => mm.userId === e.target.value); if (mem) up({ [keyName]: [...draft![keyName], { name: mem.name || mem.email, team: memberTeam(mem), projectRole: "" }] } as Partial<Content>); }} className={cell}>
                        <option value="">+ Add from team members…</option>
                        {members.map((mem) => <option key={mem.userId} value={mem.userId}>{mem.name || mem.email}</option>)}
                      </select>
                    </div>
                  )}
                </Block>
              );
            })}

            {/* ---- Milestones ---- */}
            <Block title="Project milestones">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead><tr className="border-b border-neutral-100"><th className={th}>Milestone</th><th className={th}>Target date</th>{pbEditing && <th className={th}></th>}</tr></thead>
                  <tbody>
                    {view.milestones.length === 0 && !pbEditing && <tr><td className={`${td} text-neutral-400`} colSpan={2}>None.</td></tr>}
                    {view.milestones.map((mst, i) => (
                      <tr key={i} className="border-b border-neutral-50">
                        {pbEditing ? (
                          <>
                            <td className={td}><input value={mst.milestone} onChange={(e) => up({ milestones: draft!.milestones.map((x, j) => j === i ? { ...x, milestone: e.target.value } : x) })} className={`${cell} w-full`} /></td>
                            <td className={td}><input value={mst.targetDate} onChange={(e) => up({ milestones: draft!.milestones.map((x, j) => j === i ? { ...x, targetDate: e.target.value } : x) })} placeholder="MM/DD/YYYY" className={`${cell} w-full`} /></td>
                            <td className={td}><button onClick={() => up({ milestones: draft!.milestones.filter((_, j) => j !== i) })} className="text-xs text-neutral-400 hover:text-red-700">✕</button></td>
                          </>
                        ) : (
                          <><td className={td}>{mst.milestone}</td><td className={td}>{mst.targetDate}</td></>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {pbEditing && <button onClick={() => up({ milestones: [...draft!.milestones, { milestone: "", targetDate: "" }] })} className="mt-2 rounded-md border border-neutral-300 px-2.5 py-1 text-xs hover:bg-neutral-50">+ Add milestone</button>}
            </Block>

            {/* ---- In-scope epics ---- */}
            <Block title="In-scope epics">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead><tr className="border-b border-neutral-100"><th className={th}>Jira epic</th><th className={th}>Epic name</th><th className={th}>Scope detail</th>{pbEditing && <th className={th}></th>}</tr></thead>
                  <tbody>
                    {view.inScopeEpics.length === 0 && !pbEditing && <tr><td className={`${td} text-neutral-400`} colSpan={3}>None.</td></tr>}
                    {view.inScopeEpics.map((ep, i) => (
                      <tr key={i} className="border-b border-neutral-50">
                        {pbEditing ? (
                          <>
                            <td className={td}><input value={ep.jiraId} onChange={(e) => up({ inScopeEpics: draft!.inScopeEpics.map((x, j) => j === i ? { ...x, jiraId: e.target.value } : x) })} placeholder="PROJ-123" className={`${cell} w-24`} /><input value={ep.jiraUrl} onChange={(e) => up({ inScopeEpics: draft!.inScopeEpics.map((x, j) => j === i ? { ...x, jiraUrl: e.target.value } : x) })} placeholder="https://…" className={`${cell} mt-1 w-40`} /></td>
                            <td className={td}><input value={ep.name} onChange={(e) => up({ inScopeEpics: draft!.inScopeEpics.map((x, j) => j === i ? { ...x, name: e.target.value } : x) })} className={`${cell} w-full`} /></td>
                            <td className={td}><textarea value={ep.scopeDetail} onChange={(e) => up({ inScopeEpics: draft!.inScopeEpics.map((x, j) => j === i ? { ...x, scopeDetail: e.target.value } : x) })} rows={2} className={`${cell} w-full`} /></td>
                            <td className={td}><button onClick={() => up({ inScopeEpics: draft!.inScopeEpics.filter((_, j) => j !== i) })} className="text-xs text-neutral-400 hover:text-red-700">✕</button></td>
                          </>
                        ) : (
                          <>
                            <td className={td}>{ep.jiraUrl ? <a href={ep.jiraUrl} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline">{ep.jiraId || "link"}</a> : ep.jiraId || "—"}</td>
                            <td className={td}>{ep.name}</td><td className={td}>{ep.scopeDetail}</td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {pbEditing && <button onClick={() => up({ inScopeEpics: [...draft!.inScopeEpics, { jiraId: "", jiraUrl: "", name: "", scopeDetail: "" }] })} className="mt-2 rounded-md border border-neutral-300 px-2.5 py-1 text-xs hover:bg-neutral-50">+ Add epic</button>}
            </Block>

            {/* ---- Adoption support ---- */}
            <Block title="Adoption support (markets)">
              {pbEditing ? (
                <div className="space-y-2">
                  {draft!.adoptionMarkets.map((mk, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input value={mk} onChange={(e) => up({ adoptionMarkets: draft!.adoptionMarkets.map((x, j) => j === i ? e.target.value : x) })} placeholder="e.g. US, Canada" className={`${cell} w-64`} />
                      <button onClick={() => up({ adoptionMarkets: draft!.adoptionMarkets.filter((_, j) => j !== i) })} className="text-xs text-neutral-400 hover:text-red-700">✕</button>
                    </div>
                  ))}
                  <button onClick={() => up({ adoptionMarkets: [...draft!.adoptionMarkets, ""] })} className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs hover:bg-neutral-50">+ Add market</button>
                </div>
              ) : view.adoptionMarkets.length ? (
                <div className="flex flex-wrap gap-2">{view.adoptionMarkets.map((mk, i) => <span key={i} className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs text-neutral-700">{mk}</span>)}</div>
              ) : (
                <p className="text-sm text-neutral-400">—</p>
              )}
            </Block>

            {/* ---- Future scope ---- */}
            <Block title="Future scope">
              {pbEditing ? <textarea value={draft!.futureScope} onChange={(e) => up({ futureScope: e.target.value })} rows={3} className={field} /> : <p className="whitespace-pre-wrap text-sm text-neutral-800">{view.futureScope || "—"}</p>}
            </Block>

            {/* ---- KPIs ---- */}
            <Block title="KPIs & measurement strategy">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead><tr className="border-b border-neutral-100"><th className={th}>KPI / metric</th><th className={th}>Target value</th><th className={th}>Measurement strategy</th>{pbEditing && <th className={th}></th>}</tr></thead>
                  <tbody>
                    {view.kpis.length === 0 && !pbEditing && <tr><td className={`${td} text-neutral-400`} colSpan={3}>None.</td></tr>}
                    {view.kpis.map((k, i) => (
                      <tr key={i} className="border-b border-neutral-50">
                        {pbEditing ? (
                          <>
                            <td className={td}><input value={k.metric} onChange={(e) => up({ kpis: draft!.kpis.map((x, j) => j === i ? { ...x, metric: e.target.value } : x) })} className={`${cell} w-full`} /></td>
                            <td className={td}><input value={k.targetValue} onChange={(e) => up({ kpis: draft!.kpis.map((x, j) => j === i ? { ...x, targetValue: e.target.value } : x) })} className={`${cell} w-full`} /></td>
                            <td className={td}><textarea value={k.measurementStrategy} onChange={(e) => up({ kpis: draft!.kpis.map((x, j) => j === i ? { ...x, measurementStrategy: e.target.value } : x) })} rows={2} className={`${cell} w-full`} /></td>
                            <td className={td}><button onClick={() => up({ kpis: draft!.kpis.filter((_, j) => j !== i) })} className="text-xs text-neutral-400 hover:text-red-700">✕</button></td>
                          </>
                        ) : (
                          <><td className={td}>{k.metric}</td><td className={td}>{k.targetValue}</td><td className={td}>{k.measurementStrategy}</td></>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {pbEditing && <button onClick={() => up({ kpis: [...draft!.kpis, { metric: "", targetValue: "", measurementStrategy: "" }] })} className="mt-2 rounded-md border border-neutral-300 px-2.5 py-1 text-xs hover:bg-neutral-50">+ Add KPI</button>}
            </Block>

            {/* ---- Operational & change management ---- */}
            <Block title="Operational & change management">
              {pbEditing ? <textarea value={draft!.operationalChangeManagement} onChange={(e) => up({ operationalChangeManagement: e.target.value })} rows={4} className={field} /> : <p className="whitespace-pre-wrap text-sm text-neutral-800">{view.operationalChangeManagement || "—"}</p>}
            </Block>

            {g < 100 && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">Groundedness is informational — it reflects how much of your knowledge base the AI cited. Review AI-generated content before approving; agents propose, you commit.</p>}
          </div>
        )}
      </section>
    </div>
  );
}
