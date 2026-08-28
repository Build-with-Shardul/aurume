"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  generateProjectTestCases,
  generateEpicTestCases,
  generateStoryTestCases,
  updateTestCase,
  setTestCaseStatus,
  deleteTestCase,
  setTestPlanApprovers,
  approveTestPlan,
  runTestCase,
  addTestCredential,
  deleteTestCredential,
} from "./actions";
import type { TestRunResult } from "@/lib/testing";

export type CredentialView = { id: string; name: string; kind: string; username: string | null; targetUrl: string | null; hasSecret: boolean };
const RUNNABLE = new Set(["api", "ui", "accessibility"]);

export type TestPlanView = {
  id: string;
  version: number;
  status: string;
  stale: boolean;
  groundedness: number | null;
  provider: string | null;
  model: string | null;
  edited: boolean;
  approvers: Array<{ userId: string; name: string; approvedAt: string | null }>;
  tokens: number | null;
  costUsdMicros: number | null;
};
export type TestCaseView = {
  id: string;
  epicId: string | null;
  storyId: string | null;
  category: string;
  title: string;
  priority: string;
  preconditions: string | null;
  steps: string[];
  expectedResult: string | null;
  suites: string[];
  status: string;
  lastRunStatus: string | null;
};
export type StoryCoverage = { storyId: string; title: string; epicName: string; caseCount: number; covered: boolean };

type Member = { userId: string; name: string | null; email: string };
type ModelInfo = { provider: string; options: string[]; defaultModel: string };
type LogEntry = { version: number | null; at: string; model: string; tokens: number; costUsdMicros: number | null; groundedness: number | null; outcome: string };

const CATEGORIES: [string, string][] = [
  ["happy", "Happy path"], ["edge", "Edge cases"], ["negative", "Negative / error"], ["api", "API"],
  ["ui", "UI"], ["performance", "Performance"], ["security", "Security"], ["accessibility", "Accessibility"],
];
const SUITES = ["smoke", "sanity", "regression", "e2e"];
const PRIORITIES = ["high", "medium", "low"];
const money = (micros: number | null) => (micros == null ? "—" : `$${(micros / 1e6).toFixed(4)}`);
const priTone = (p: string) => (p === "high" ? "bg-red-100 text-red-700" : p === "medium" ? "bg-amber-100 text-amber-700" : "bg-neutral-100 text-neutral-500");
const runTone = (s: string) => (s === "passed" ? "bg-green-100 text-green-700" : s === "failed" || s === "error" ? "bg-red-100 text-red-700" : "bg-neutral-100 text-neutral-500");
const runText = (s: string) => (s === "passed" ? "text-green-600" : s === "failed" || s === "error" ? "text-red-600" : "text-neutral-500");
const runMark = (s: string) => (s === "passed" ? "✓" : s === "failed" ? "✗" : s === "error" ? "!" : "–");

export default function TestsWorkspace({
  projectId, plan, cases, coverage, epics, stories, members, canWork, meId, modelInfo, generationLog, credentials, browserbaseConnected,
}: {
  projectId: string;
  plan: TestPlanView | null;
  cases: TestCaseView[];
  coverage: StoryCoverage[];
  epics: { id: string; name: string }[];
  stories: { id: string; title: string }[];
  members: Member[];
  canWork: boolean;
  meId: string;
  modelInfo: ModelInfo;
  generationLog: LogEntry[];
  credentials: CredentialView[];
  browserbaseConnected: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState(modelInfo.defaultModel);
  const [genEpic, setGenEpic] = useState(epics[0]?.id ?? "");
  const [suiteFilter, setSuiteFilter] = useState<string>("all");
  const [catFilter, setCatFilter] = useState<string>("all");
  const [showApprovers, setShowApprovers] = useState(false);
  const [baseUrl, setBaseUrl] = useState("");
  const [bearer, setBearer] = useState("");

  async function run<T>(key: string, fn: () => Promise<T & { error?: string }>) {
    setBusy(key); setError(null);
    try {
      const res = await fn();
      if (res && "error" in res && res.error) setError(res.error);
      else router.refresh();
      return res;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally { setBusy(null); }
  }

  const visible = useMemo(
    () => cases.filter((c) => (suiteFilter === "all" || c.suites.includes(suiteFilter)) && (catFilter === "all" || c.category === catFilter)),
    [cases, suiteFilter, catFilter],
  );
  const suiteCounts = useMemo(() => {
    const m: Record<string, number> = { all: cases.length };
    for (const s of SUITES) m[s] = cases.filter((c) => c.suites.includes(s)).length;
    return m;
  }, [cases]);

  const covered = coverage.filter((c) => c.covered).length;
  const myApprover = plan?.approvers.find((a) => a.userId === meId);
  const canApprove = plan ? (plan.approvers.length === 0 ? canWork : !!myApprover && !myApprover.approvedAt) : false;

  // ---- empty state ----
  if (!plan) {
    return (
      <div className="rounded-xl border border-neutral-200 bg-white p-8 text-center">
        <div className="text-lg font-medium">No test cases yet</div>
        <p className="mx-auto mt-1 max-w-md text-sm text-neutral-500">
          Generate a full corpus — per epic, grounded in your stories&apos; acceptance criteria and the technical design.
        </p>
        {epics.length === 0 && <p className="mt-2 text-xs text-amber-700">Add epics & stories first — cases are generated per epic.</p>}
        <div className="mt-5 flex items-center justify-center gap-2">
          <ModelPicker modelInfo={modelInfo} model={model} setModel={setModel} />
          <button onClick={() => run("gen", () => generateProjectTestCases(projectId, model))} disabled={!canWork || busy === "gen" || epics.length === 0} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">
            {busy === "gen" ? "Generating…" : "Generate test cases"}
          </button>
        </div>
        <p className="mt-2 text-xs text-neutral-400">Generates each epic in turn — this can take a while for large projects.</p>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* header */}
      <div className="rounded-xl border border-neutral-200 bg-white p-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-sm font-semibold">v{plan.version}</span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${plan.status === "approved" ? "bg-green-100 text-green-700" : "bg-neutral-100 text-neutral-600"}`}>{plan.status}</span>
          {plan.stale && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">out of date</span>}
          {plan.edited && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600">edited</span>}
          <span className="text-xs text-neutral-400">{cases.length} cases</span>
          <span className="ml-auto flex flex-wrap items-center gap-x-3 text-xs text-neutral-500">
            {plan.groundedness != null && <span>{plan.groundedness}% grounded</span>}
            <span>{plan.provider && plan.model ? `${plan.provider}/${plan.model}` : "—"}</span>
            {plan.tokens != null && <span>{plan.tokens.toLocaleString()} tok</span>}
            <span>{money(plan.costUsdMicros)}</span>
          </span>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <ModelPicker modelInfo={modelInfo} model={model} setModel={setModel} />
          <button onClick={() => run("gen", () => generateProjectTestCases(projectId, model))} disabled={!canWork || busy === "gen"} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium disabled:opacity-40">
            {busy === "gen" ? "Regenerating…" : "Regenerate all"}
          </button>
          {epics.length > 0 && (
            <span className="flex items-center gap-1">
              <select value={genEpic} onChange={(e) => setGenEpic(e.target.value)} className="rounded-lg border border-neutral-300 px-2 py-1.5 text-sm">
                {epics.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
              <button onClick={() => run("genEpic", () => generateEpicTestCases(projectId, genEpic, model))} disabled={!canWork || busy === "genEpic"} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium disabled:opacity-40">
                {busy === "genEpic" ? "Generating…" : "Regen epic"}
              </button>
            </span>
          )}
          {canWork && <button onClick={() => setShowApprovers((s) => !s)} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium">Approvers</button>}
          {canApprove && (
            <button onClick={() => run("approve", () => approveTestPlan(plan.id))} disabled={busy === "approve"} className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40">
              {busy === "approve" ? "Approving…" : plan.approvers.length === 0 ? "Approve" : "Approve as me"}
            </button>
          )}
          <span className="ml-auto flex items-center gap-2">
            <a href={`/api/projects/${projectId}/tests/download?format=pdf`} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:border-neutral-400">Download PDF</a>
            <a href={`/api/projects/${projectId}/tests/download?format=docx`} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:border-neutral-400">Word</a>
          </span>
        </div>

        {showApprovers && (
          <ApproverEditor members={members} approvers={plan.approvers} canWork={canWork} onChange={(ids) => run("approvers", () => setTestPlanApprovers(plan.id, ids))} />
        )}
        {plan.approvers.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {plan.approvers.map((a) => (
              <span key={a.userId} className={`rounded-full border px-2 py-0.5 ${a.approvedAt ? "border-green-200 bg-green-50 text-green-700" : "border-neutral-200 text-neutral-500"}`}>{a.name} {a.approvedAt ? `✓ ${new Date(a.approvedAt).toLocaleDateString()}` : "· pending"}</span>
            ))}
          </div>
        )}
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>

      {/* coverage */}
      <div className="rounded-xl border border-neutral-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Coverage</span>
          <span className="text-sm text-neutral-500">{covered}/{coverage.length} stories covered</span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-neutral-100">
          <div className="h-full bg-green-500" style={{ width: coverage.length ? `${(covered / coverage.length) * 100}%` : "0%" }} />
        </div>
        {coverage.some((c) => !c.covered) && (
          <div className="mt-3 space-y-1">
            <div className="text-xs font-medium text-amber-700">Uncovered stories</div>
            {coverage.filter((c) => !c.covered).map((c) => (
              <div key={c.storyId} className="flex items-center justify-between rounded border border-neutral-100 px-3 py-1.5 text-sm">
                <span className="truncate text-neutral-700" title={c.title}>{c.title} <span className="text-neutral-400">· {c.epicName}</span></span>
                {canWork && <button onClick={() => run(`story-${c.storyId}`, () => generateStoryTestCases(projectId, c.storyId, model))} disabled={busy === `story-${c.storyId}`} className="shrink-0 rounded border border-neutral-300 px-2 py-0.5 text-xs font-medium disabled:opacity-40">{busy === `story-${c.storyId}` ? "…" : "Generate"}</button>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* filters */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-neutral-400">Suite:</span>
        {["all", ...SUITES].map((s) => (
          <button key={s} onClick={() => setSuiteFilter(s)} className={`rounded-full border px-2.5 py-1 ${suiteFilter === s ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 text-neutral-600"}`}>
            {s}{s !== "all" && suiteCounts[s] != null ? ` (${suiteCounts[s]})` : ""}
          </button>
        ))}
        <span className="ml-3 text-neutral-400">Category:</span>
        <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className="rounded-lg border border-neutral-300 px-2 py-1 text-xs">
          <option value="all">All</option>
          {CATEGORIES.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
        <span className="text-neutral-400">· {visible.length} shown</span>
      </div>

      {/* run settings (Phase 1: API runner) */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-xs">
        <span className="font-medium text-neutral-600">Run API cases against:</span>
        <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="Base URL — https://api.example.com" className="w-64 rounded border border-neutral-300 px-2 py-1" />
        <input value={bearer} onChange={(e) => setBearer(e.target.value)} placeholder="Bearer token (optional)" type="password" className="w-48 rounded border border-neutral-300 px-2 py-1" />
        <span className="text-neutral-400">API cases execute here; UI cases run via the browser agent (Browserbase).</span>
      </div>

      <EnginePanel projectId={projectId} browserbaseConnected={browserbaseConnected} credentials={credentials} canWork={canWork} run={run} busy={busy} />

      {/* cases by category */}
      {CATEGORIES.map(([cat, label]) => {
        const rows = visible.filter((c) => c.category === cat);
        if (!rows.length) return null;
        return (
          <div key={cat} className="rounded-xl border border-neutral-200 bg-white">
            <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-3">
              <span className="text-sm font-semibold">{label}</span>
              <span className="text-xs text-neutral-400">{rows.length}</span>
            </div>
            <div className="divide-y divide-neutral-100">
              {rows.map((c) => <CaseRow key={c.id} c={c} canWork={canWork} storyTitle={stories.find((s) => s.id === c.storyId)?.title} run={run} busy={busy} runCfg={{ baseUrl, bearer, model }} />)}
            </div>
          </div>
        );
      })}

      {generationLog.length > 0 && (
        <div className="rounded-xl border border-neutral-200 bg-white">
          <div className="border-b border-neutral-200 px-5 py-3 text-sm font-medium">Generation log</div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead><tr className="border-b border-neutral-100 text-left text-[11px] uppercase tracking-wide text-neutral-400"><th className="px-4 py-2">Version</th><th className="px-4 py-2">When</th><th className="px-4 py-2">Model</th><th className="px-4 py-2">Tokens</th><th className="px-4 py-2">Cost</th><th className="px-4 py-2">Grounded</th><th className="px-4 py-2">Outcome</th></tr></thead>
              <tbody>
                {generationLog.map((l, i) => (
                  <tr key={i} className="border-b border-neutral-50">
                    <td className="px-4 py-2">{l.version != null ? `v${l.version}` : "—"}</td>
                    <td className="px-4 py-2 text-neutral-500">{new Date(l.at).toLocaleString()}</td>
                    <td className="px-4 py-2 text-neutral-500">{l.model}</td>
                    <td className="px-4 py-2">{l.tokens.toLocaleString()}</td>
                    <td className="px-4 py-2">{money(l.costUsdMicros)}</td>
                    <td className="px-4 py-2">{l.groundedness != null ? `${l.groundedness}%` : "—"}</td>
                    <td className="px-4 py-2 text-neutral-500">{l.outcome}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function CaseRow({ c, canWork, storyTitle, run, busy, runCfg }: { c: TestCaseView; canWork: boolean; storyTitle?: string; run: <T>(k: string, fn: () => Promise<T & { error?: string }>) => Promise<unknown>; busy: string | null; runCfg: { baseUrl: string; bearer: string; model: string } }) {
  const [editing, setEditing] = useState(false);
  const [d, setD] = useState(c);
  const [running, setRunning] = useState(false);
  const [runRes, setRunRes] = useState<TestRunResult | null>(null);
  const [runErr, setRunErr] = useState<string | null>(null);

  async function doRun() {
    setRunning(true); setRunErr(null); setRunRes(null);
    try {
      const r = await runTestCase(c.id, { baseUrl: runCfg.baseUrl || undefined, bearer: runCfg.bearer || undefined, model: runCfg.model });
      if (r && "error" in r && r.error) setRunErr(r.error);
      else if (r && "result" in r && r.result) setRunRes(r.result);
    } catch (e) {
      setRunErr(e instanceof Error ? e.message : "Run failed.");
    } finally {
      setRunning(false);
    }
  }

  if (editing) {
    return (
      <div className="space-y-2 px-5 py-3">
        <input value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} className="w-full rounded border border-neutral-300 px-2 py-1 text-sm" />
        <div className="flex flex-wrap gap-2">
          <select value={d.category} onChange={(e) => setD({ ...d, category: e.target.value })} className="rounded border border-neutral-300 px-2 py-1 text-xs">{CATEGORIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <select value={d.priority} onChange={(e) => setD({ ...d, priority: e.target.value })} className="rounded border border-neutral-300 px-2 py-1 text-xs">{PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}</select>
          <span className="flex items-center gap-1">{SUITES.map((s) => (
            <button key={s} onClick={() => setD({ ...d, suites: d.suites.includes(s) ? d.suites.filter((x) => x !== s) : [...d.suites, s] })} className={`rounded-full border px-2 py-0.5 text-[11px] ${d.suites.includes(s) ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 text-neutral-500"}`}>{s}</button>
          ))}</span>
        </div>
        <textarea value={d.preconditions ?? ""} onChange={(e) => setD({ ...d, preconditions: e.target.value })} rows={1} placeholder="Preconditions" className="w-full rounded border border-neutral-300 px-2 py-1 text-sm" />
        <textarea value={d.steps.join("\n")} onChange={(e) => setD({ ...d, steps: e.target.value.split("\n") })} rows={3} placeholder="Given / When / Then (one per line)" className="w-full rounded border border-neutral-300 px-2 py-1 font-mono text-xs" />
        <textarea value={d.expectedResult ?? ""} onChange={(e) => setD({ ...d, expectedResult: e.target.value })} rows={1} placeholder="Expected result" className="w-full rounded border border-neutral-300 px-2 py-1 text-sm" />
        <div className="flex gap-2">
          <button onClick={async () => { const r = await run("save", () => updateTestCase(c.id, { title: d.title, category: d.category, priority: d.priority, preconditions: d.preconditions ?? "", steps: d.steps, expectedResult: d.expectedResult ?? "", suites: d.suites })); if (r && !(typeof r === "object" && r && "error" in r && (r as { error?: string }).error)) setEditing(false); }} className="rounded bg-neutral-900 px-3 py-1 text-xs font-medium text-white">Save</button>
          <button onClick={() => { setEditing(false); setD(c); }} className="rounded border border-neutral-300 px-3 py-1 text-xs font-medium">Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-5 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-neutral-900">{c.title}</span>
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${priTone(c.priority)}`}>{c.priority}</span>
            {c.suites.map((s) => <span key={s} className="rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-500">{s}</span>)}
            {c.status === "approved" && <span className="rounded-full bg-green-50 px-1.5 py-0.5 text-[10px] text-green-700">approved</span>}
            {c.lastRunStatus && <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${runTone(c.lastRunStatus)}`}>run: {c.lastRunStatus}</span>}
          </div>
          {storyTitle && <div className="mt-0.5 text-xs text-neutral-400">↳ {storyTitle}</div>}
        </div>
        {canWork && (
          <div className="flex shrink-0 items-center gap-2 text-xs">
            {RUNNABLE.has(c.category) && <button onClick={doRun} disabled={running} className="font-medium text-blue-600 hover:text-blue-800 disabled:opacity-40">{running ? "Running…" : "Run"}</button>}
            <button onClick={() => run("status", () => setTestCaseStatus(c.id, c.status !== "approved"))} className="text-neutral-500 hover:text-neutral-900">{c.status === "approved" ? "Unapprove" : "Approve"}</button>
            <button onClick={() => setEditing(true)} className="text-neutral-500 hover:text-neutral-900">Edit</button>
            <button onClick={() => run("del", () => deleteTestCase(c.id))} disabled={busy === "del"} className="text-red-500 hover:text-red-700">Delete</button>
          </div>
        )}
      </div>
      {c.preconditions && <div className="mt-1 text-xs text-neutral-500"><span className="font-medium">Pre:</span> {c.preconditions}</div>}
      {c.steps.length > 0 && <pre className="mt-1 whitespace-pre-wrap rounded bg-neutral-50 px-3 py-2 font-mono text-xs text-neutral-700">{c.steps.join("\n")}</pre>}
      {c.expectedResult && <div className="mt-1 text-xs text-neutral-600"><span className="font-medium">Expected:</span> {c.expectedResult}</div>}
      {runErr && <div className="mt-2 rounded bg-red-50 px-3 py-2 text-xs text-red-700">{runErr}</div>}
      {runRes && (
        <div className="mt-2 rounded border border-neutral-200 px-3 py-2 text-xs">
          <div>Run: <span className={`font-medium ${runText(runRes.status)}`}>{runRes.status}</span>{runRes.durationMs != null ? ` · ${runRes.durationMs}ms` : ""} <span className="text-neutral-400">· {runRes.runner}</span></div>
          {runRes.steps.map((s, i) => (
            <div key={i} className="mt-1">
              <span className={runText(s.status)}>{runMark(s.status)}</span> <span className="text-neutral-700">{s.text}</span>
              {s.detail && <div className="break-all pl-4 font-mono text-[10px] text-neutral-400">{s.detail}</div>}
            </div>
          ))}
          {runRes.error && <div className="mt-1 text-red-600">{runRes.error}</div>}
        </div>
      )}
    </div>
  );
}

function ModelPicker({ modelInfo, model, setModel }: { modelInfo: ModelInfo; model: string; setModel: (m: string) => void }) {
  if (!modelInfo.options.length) return <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="model" className="rounded-lg border border-neutral-300 px-2 py-1.5 text-sm" />;
  return (
    <select value={model} onChange={(e) => setModel(e.target.value)} className="rounded-lg border border-neutral-300 px-2 py-1.5 text-sm">
      {modelInfo.options.map((mo) => <option key={mo} value={mo}>{mo}</option>)}
    </select>
  );
}

function ApproverEditor({ members, approvers, canWork, onChange }: { members: Member[]; approvers: TestPlanView["approvers"]; canWork: boolean; onChange: (ids: string[]) => void }) {
  const selected = new Set(approvers.map((a) => a.userId));
  return (
    <div className="mt-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
      <div className="text-xs font-medium text-neutral-600">Assigned approvers (all must approve)</div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {members.map((m) => {
          const on = selected.has(m.userId);
          return (
            <button key={m.userId} disabled={!canWork} onClick={() => { const n = new Set(selected); if (on) n.delete(m.userId); else n.add(m.userId); onChange([...n]); }} className={`rounded-full border px-2.5 py-1 text-xs ${on ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 text-neutral-600"}`}>
              {m.name || m.email}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function EnginePanel({ projectId, browserbaseConnected, credentials, canWork, run, busy }: { projectId: string; browserbaseConnected: boolean; credentials: CredentialView[]; canWork: boolean; run: <T>(k: string, fn: () => Promise<T & { error?: string }>) => Promise<unknown>; busy: string | null }) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ name: "", kind: "login", targetUrl: "", username: "", secret: "" });

  return (
    <div className="rounded-xl border border-neutral-200 bg-white">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between px-5 py-3 text-left">
        <span className="text-sm font-medium">Testing engine & credentials</span>
        <span className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1"><i className="inline-block h-1.5 w-1.5 rounded-full bg-green-500" />API runner ready</span>
          <span className="flex items-center gap-1"><i className={`inline-block h-1.5 w-1.5 rounded-full ${browserbaseConnected ? "bg-green-500" : "bg-neutral-300"}`} />UI agent {browserbaseConnected ? "connected" : "not connected"}</span>
          <span className="text-neutral-400">{open ? "▲" : "▼"}</span>
        </span>
      </button>
      {open && (
        <div className="space-y-4 border-t border-neutral-100 px-5 py-4">
          {!browserbaseConnected && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              UI (browser) tests need Browserbase. Add an API key + Project ID in{" "}
              <a href="/settings/connectors" className="font-medium underline">Settings → Connectors → Browserbase</a>. The agent runs each UI test in a live cloud browser you can watch.
            </p>
          )}

          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-neutral-600">Test credentials <span className="text-neutral-400">(the UI agent injects these when a test logs in — secrets encrypted, never shown)</span></span>
              {canWork && <button onClick={() => setAdding((a) => !a)} className="rounded border border-neutral-300 px-2 py-0.5 text-xs font-medium">{adding ? "Close" : "+ Add"}</button>}
            </div>
            {credentials.length === 0 && !adding && <p className="mt-2 text-xs text-neutral-400">No credentials yet.</p>}
            {credentials.length > 0 && (
              <div className="mt-2 space-y-1">
                {credentials.map((c) => (
                  <div key={c.id} className="flex items-center justify-between rounded border border-neutral-100 px-3 py-1.5 text-xs">
                    <span className="text-neutral-700"><span className="font-medium">{c.name}</span> <span className="text-neutral-400">· {c.kind}{c.username ? ` · ${c.username}` : ""}{c.targetUrl ? ` · ${c.targetUrl}` : ""} · secret ••••</span></span>
                    {canWork && <button onClick={() => run(`delcred-${c.id}`, () => deleteTestCredential(c.id))} disabled={busy === `delcred-${c.id}`} className="text-red-500 hover:text-red-700">Delete</button>}
                  </div>
                ))}
              </div>
            )}
            {adding && canWork && (
              <div className="mt-2 space-y-2 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
                <div className="flex flex-wrap gap-2">
                  <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Name (e.g. first-run user)" className="flex-1 rounded border border-neutral-300 px-2 py-1 text-xs" />
                  <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} className="rounded border border-neutral-300 px-2 py-1 text-xs"><option value="login">login</option><option value="token">token</option></select>
                </div>
                <input value={f.targetUrl} onChange={(e) => setF({ ...f, targetUrl: e.target.value })} placeholder="Target/login URL (optional)" className="w-full rounded border border-neutral-300 px-2 py-1 text-xs" />
                {f.kind === "login" && <input value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} placeholder="Username / email" className="w-full rounded border border-neutral-300 px-2 py-1 text-xs" />}
                <input value={f.secret} onChange={(e) => setF({ ...f, secret: e.target.value })} type="password" placeholder={f.kind === "token" ? "Token" : "Password"} className="w-full rounded border border-neutral-300 px-2 py-1 text-xs" />
                <button
                  onClick={async () => { const r = await run("addcred", () => addTestCredential(projectId, f)); if (r && !(typeof r === "object" && r && "error" in r && (r as { error?: string }).error)) { setF({ name: "", kind: "login", targetUrl: "", username: "", secret: "" }); setAdding(false); } }}
                  disabled={busy === "addcred" || !f.name.trim()}
                  className="rounded bg-neutral-900 px-3 py-1 text-xs font-medium text-white disabled:opacity-40"
                >Save credential</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
