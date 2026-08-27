"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DISCIPLINE_LABEL } from "@/lib/permissions";
import { COMPLIANCE_FRAMEWORKS, slugifyCompliance } from "@/lib/compliance";
import {
  createFeature,
  updateFeature,
  deleteFeature,
  generateProductPlaybook,
  savePlaybookContent,
  setApprovers,
  approvePlaybook,
  setCompliance,
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
  approvers: Array<{ userId: string; name: string; approvedAt: string | null }>;
  promptTokens: number | null;
  completionTokens: number | null;
  costUsdMicros: number | null;
};
type Member = { userId: string; name: string | null; email: string; discipline: string | null };
type ModelInfo = { provider: string; options: string[]; defaultModel: string };
type LogEntry = { version: number | null; at: string; model: string; tokens: number; promptTokens: number; completionTokens: number; costUsdMicros: number | null; groundedness: number | null; outcome: string };

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

type Compliance = { key: string; label: string };

export default function PlaybookWorkspace({
  projectId,
  features,
  playbook,
  members,
  compliances,
  canWork,
  meId,
  modelInfo,
  generationLog,
}: {
  projectId: string;
  features: Feature[];
  playbook: PlaybookView | null;
  members: Member[];
  compliances: Compliance[];
  canWork: boolean;
  meId: string;
  modelInfo: ModelInfo;
  generationLog: LogEntry[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [model, setModel] = useState(modelInfo.options.includes(modelInfo.defaultModel) ? modelInfo.defaultModel : modelInfo.options[0] ?? "");
  const [showLog, setShowLog] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [aTitle, setATitle] = useState("");
  const [aBrief, setABrief] = useState("");
  const [editId, setEditId] = useState("");
  const [eTitle, setETitle] = useState("");
  const [eBrief, setEBrief] = useState("");
  const [pbEditing, setPbEditing] = useState(false);
  const [draft, setDraft] = useState<Content | null>(null);
  const [customCmp, setCustomCmp] = useState("");

  const selectedCmp = new Set(compliances.map((c) => c.key));
  const predefinedKeys = new Set(COMPLIANCE_FRAMEWORKS.map((f) => f.key));
  const customCmps = compliances.filter((c) => !predefinedKeys.has(c.key));

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

        {/* Compliance */}
        <div className="mt-8">
          <h2 className="text-sm font-semibold">Compliance</h2>
          <p className="mt-0.5 text-xs text-neutral-400">What this project must follow. Selections shape the generated playbook.</p>
          <ul className="mt-3 space-y-1.5">
            {COMPLIANCE_FRAMEWORKS.map((f) => {
              const on = selectedCmp.has(f.key);
              return (
                <li key={f.key}>
                  <label className="flex cursor-pointer items-start gap-2">
                    <input type="checkbox" checked={on} disabled={!canWork || busy === `cmp-${f.key}`} onChange={(e) => run(`cmp-${f.key}`, () => setCompliance(projectId, f.key, f.label, e.target.checked))} className="mt-0.5 accent-neutral-900" />
                    <span className="text-sm">
                      <span className="font-medium">{f.label}</span>
                      <span className="ml-1 text-xs text-neutral-400">{f.description}</span>
                    </span>
                  </label>
                </li>
              );
            })}
            {customCmps.map((c) => (
              <li key={c.key}>
                <label className="flex cursor-pointer items-center gap-2">
                  <input type="checkbox" checked disabled={!canWork || busy === `cmp-${c.key}`} onChange={() => run(`cmp-${c.key}`, () => setCompliance(projectId, c.key, c.label, false))} className="accent-neutral-900" />
                  <span className="text-sm font-medium">{c.label}</span>
                  <span className="text-[11px] text-neutral-400">(custom)</span>
                </label>
              </li>
            ))}
          </ul>
          {canWork && (
            <div className="mt-3 flex gap-2">
              <input value={customCmp} onChange={(e) => setCustomCmp(e.target.value)} placeholder="Add custom…" className={`${cell} flex-1`} />
              <button
                disabled={!customCmp.trim() || busy === "cmp-add"}
                onClick={() => run("cmp-add", () => setCompliance(projectId, slugifyCompliance(customCmp), customCmp.trim(), true), () => setCustomCmp(""))}
                className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs hover:bg-neutral-50 disabled:opacity-50"
              >
                Add
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* RIGHT: product playbook */}
      <section>
        {err && <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}

        {!playbook || !view ? (
          <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-10 text-center">
            <div className="text-lg font-medium">No product playbook yet</div>
            <p className="mx-auto mt-1 max-w-md text-sm text-neutral-500">One grounded, structured product playbook — synthesized from this product&apos;s features and your knowledge. You review, assign approvers, and approve.</p>
            {canWork && (
              <div className="mt-4 flex items-center justify-center gap-2">
                {modelInfo.options.length > 0 && (
                  <select value={model} onChange={(e) => setModel(e.target.value)} className={cell} title="Model">
                    {modelInfo.options.map((mo) => <option key={mo} value={mo}>{mo}</option>)}
                  </select>
                )}
                <button disabled={busy === "gen"} onClick={() => run("gen", () => generateProductPlaybook(projectId, model))} className="rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50">{busy === "gen" ? "Generating…" : "Generate product playbook"}</button>
              </div>
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
                {playbook.promptTokens != null && (
                  <span className="text-neutral-400" title={`${playbook.promptTokens.toLocaleString()} in + ${(playbook.completionTokens ?? 0).toLocaleString()} out`}>
                    · {((playbook.promptTokens ?? 0) + (playbook.completionTokens ?? 0)).toLocaleString()} tokens
                    {playbook.costUsdMicros != null && ` · ~$${(playbook.costUsdMicros / 1e6).toFixed(3)}`}
                  </span>
                )}
                {playbook.edited && <span className="text-neutral-400">· human-edited</span>}
              </div>
              <div className="flex items-center gap-2">
                <a href={`/api/projects/${projectId}/playbook/download?format=docx`} className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs hover:bg-neutral-50" title="Download as Word (.docx) with approval status">⬇ Word</a>
                <a href={`/api/projects/${projectId}/playbook/download?format=pdf`} className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs hover:bg-neutral-50" title="Download as PDF with approval status">⬇ PDF</a>
                {canWork && (
                  <>
                    {!pbEditing && !approved && <button onClick={() => { setDraft(playbook.content); setPbEditing(true); }} className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs hover:bg-neutral-50">Edit</button>}
                    {pbEditing && (
                      <>
                        <button disabled={busy === "save"} onClick={() => draft && run("save", () => savePlaybookContent(playbook.id, draft), () => setPbEditing(false))} className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800 disabled:opacity-50">{busy === "save" ? "Saving…" : "Save"}</button>
                        <button onClick={() => { setPbEditing(false); setDraft(null); }} className="text-xs text-neutral-500 hover:text-neutral-900">Cancel</button>
                      </>
                    )}
                    {modelInfo.options.length > 0 && (
                      <select value={model} onChange={(e) => setModel(e.target.value)} className="rounded-md border border-neutral-300 px-2 py-1 text-xs outline-none focus:border-neutral-900" title="Model for the next generation">
                        {modelInfo.options.map((mo) => <option key={mo} value={mo}>{mo}</option>)}
                      </select>
                    )}
                    <button disabled={busy === "gen"} onClick={() => run("gen", () => generateProductPlaybook(projectId, model))} className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs hover:bg-neutral-50 disabled:opacity-50">{busy === "gen" ? "…" : playbook.stale ? "Update playbook" : "Regenerate"}</button>
                  </>
                )}
              </div>
            </div>

            {playbook.stale && <p className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-800">Features or knowledge changed since this version. Click <strong>Update playbook</strong> to regenerate.</p>}

            {/* approvers + approve */}
            {(() => {
              const approverIds = playbook.approvers.map((a) => a.userId);
              const mine = playbook.approvers.find((a) => a.userId === meId);
              const meCanApprove = playbook.approvers.length === 0 ? canWork : !!mine && !mine.approvedAt;
              const addable = members.filter((mem) => !approverIds.includes(mem.userId));
              return (
                <div className="rounded-xl border border-neutral-200 bg-white px-5 py-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Approvers</span>
                    {!approved && meCanApprove && (
                      <button disabled={busy === "approve"} onClick={() => run("approve", () => approvePlaybook(playbook.id))} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50">
                        {busy === "approve" ? "Approving…" : playbook.approvers.length === 0 ? "Approve" : "Approve (as me)"}
                      </button>
                    )}
                  </div>
                  {playbook.approvers.length === 0 ? (
                    <p className="mt-1 text-xs text-neutral-400">No approvers assigned{canWork ? " — add one or more below." : "."}</p>
                  ) : (
                    <ul className="mt-2 space-y-1">
                      {playbook.approvers.map((a) => (
                        <li key={a.userId} className="flex items-center justify-between text-sm">
                          <span>{a.name}{a.userId === meId && <span className="ml-1 text-xs text-neutral-400">(you)</span>}</span>
                          <span className="flex items-center gap-2">
                            {a.approvedAt ? (
                              <span className="text-xs text-green-600">✓ Approved {new Date(a.approvedAt).toLocaleString()}</span>
                            ) : (
                              <span className="text-xs text-amber-600">Pending</span>
                            )}
                            {canWork && !approved && (
                              <button onClick={() => run(`unapprover-${a.userId}`, () => setApprovers(playbook.id, approverIds.filter((x) => x !== a.userId)))} className="text-xs text-neutral-400 hover:text-red-700" title="Remove approver">✕</button>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {canWork && !approved && addable.length > 0 && (
                    <div className="mt-2">
                      <select value="" onChange={(e) => { if (e.target.value) run("addapprover", () => setApprovers(playbook.id, [...approverIds, e.target.value])); }} className={cell}>
                        <option value="">+ Add approver…</option>
                        {addable.map((mem) => <option key={mem.userId} value={mem.userId}>{mem.name || mem.email}</option>)}
                      </select>
                    </div>
                  )}
                </div>
              );
            })()}

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

            {/* ---- Generation log ---- */}
            {generationLog.length > 0 && (
              <div className="rounded-xl border border-neutral-200 bg-white">
                <button onClick={() => setShowLog((v) => !v)} className="flex w-full items-center justify-between px-5 py-3 text-sm font-medium">
                  <span>Generation log ({generationLog.length})</span>
                  <span className="text-xs text-neutral-400">
                    {generationLog.reduce((s, e) => s + e.tokens, 0).toLocaleString()} tokens total
                    {generationLog.some((e) => e.costUsdMicros != null) && ` · ~$${(generationLog.reduce((s, e) => s + (e.costUsdMicros ?? 0), 0) / 1e6).toFixed(3)}`}
                    {" "}{showLog ? "▲" : "▼"}
                  </span>
                </button>
                {showLog && (
                  <div className="overflow-x-auto border-t border-neutral-100">
                    <table className="w-full border-collapse">
                      <thead><tr className="border-b border-neutral-100"><th className={th}>Ver</th><th className={th}>When</th><th className={th}>Model</th><th className={th}>Tokens (in/out)</th><th className={th}>Cost</th><th className={th}>Grounded</th><th className={th}>Outcome</th></tr></thead>
                      <tbody>
                        {generationLog.map((e, i) => (
                          <tr key={i} className="border-b border-neutral-50">
                            <td className={td}>{e.version != null ? `v${e.version}` : "—"}</td>
                            <td className={td}>{new Date(e.at).toLocaleString()}</td>
                            <td className={td}>{e.model}</td>
                            <td className={td}>{e.tokens.toLocaleString()} <span className="text-neutral-400">({e.promptTokens.toLocaleString()}/{e.completionTokens.toLocaleString()})</span></td>
                            <td className={td}>{e.costUsdMicros != null ? `~$${(e.costUsdMicros / 1e6).toFixed(3)}` : "—"}</td>
                            <td className={td}>{e.groundedness != null ? `${e.groundedness}%` : "—"}</td>
                            <td className={td}>{e.outcome}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
