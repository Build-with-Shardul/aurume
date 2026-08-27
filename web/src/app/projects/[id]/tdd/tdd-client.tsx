"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { TechDocContent } from "@/lib/ai/techdoc";
import { generateTechDoc, saveTechDocContent, setTechDocApprovers, approveTechDoc } from "./actions";

type Member = { userId: string; name: string | null; email: string; discipline: string | null };
type Approver = { userId: string; name: string; approvedAt: string | null };
type ModelInfo = { provider: string; options: string[]; defaultModel: string };
type LogEntry = { version: number | null; at: string; model: string; tokens: number; costUsdMicros: number | null; groundedness: number | null; outcome: string };

export type TechDocView = {
  id: string;
  version: number;
  status: string;
  stale: boolean;
  content: TechDocContent;
  groundedness: number | null;
  provider: string | null;
  model: string | null;
  edited: boolean;
  sourcePlaybookVersion: string | null;
  approvers: Approver[];
  promptTokens: number | null;
  completionTokens: number | null;
  costUsdMicros: number | null;
};

const money = (micros: number | null) => (micros == null ? "—" : `$${(micros / 1e6).toFixed(4)}`);

export default function TechDocWorkspace({
  projectId,
  techDoc,
  members,
  canWork,
  meId,
  modelInfo,
  playbookLabel,
  generationLog,
}: {
  projectId: string;
  techDoc: TechDocView | null;
  members: Member[];
  canWork: boolean;
  meId: string;
  modelInfo: ModelInfo;
  playbookLabel: string | null;
  generationLog: LogEntry[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState(modelInfo.defaultModel);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<TechDocContent | null>(null);
  const [showApprovers, setShowApprovers] = useState(false);

  async function run<T>(key: string, fn: () => Promise<T & { error?: string }>) {
    setBusy(key);
    setError(null);
    try {
      const res = await fn();
      if (res && "error" in res && res.error) setError(res.error);
      else router.refresh();
      return res;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  const locked = techDoc?.status === "approved";
  const content = editing && draft ? draft : techDoc?.content ?? null;

  function startEdit() {
    if (!techDoc) return;
    setDraft(structuredClone(techDoc.content));
    setEditing(true);
  }
  function patch(p: Partial<TechDocContent>) {
    setDraft((d) => (d ? { ...d, ...p } : d));
  }

  // ---- empty state ----
  if (!techDoc) {
    return (
      <div className="rounded-xl border border-neutral-200 bg-white p-8 text-center">
        <div className="text-lg font-medium">No technical design document yet</div>
        <p className="mx-auto mt-1 max-w-md text-sm text-neutral-500">
          Generate one, grounded in {playbookLabel ? `the product playbook (${playbookLabel}),` : "the product playbook,"} features, compliance, and knowledge.
        </p>
        {!playbookLabel && <p className="mt-2 text-xs text-amber-700">No product playbook yet — the doc will be inferred from features with lower confidence. Generating the playbook first is recommended.</p>}
        <div className="mt-5 flex items-center justify-center gap-2">
          <ModelPicker modelInfo={modelInfo} model={model} setModel={setModel} />
          <button
            onClick={() => run("gen", () => generateTechDoc(projectId, model))}
            disabled={!canWork || busy === "gen"}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {busy === "gen" ? "Generating…" : "Generate tech doc"}
          </button>
        </div>
        {!canWork && <p className="mt-2 text-xs text-neutral-400">You don&apos;t have permission to generate here.</p>}
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  const c = content!;
  const myApprover = techDoc.approvers.find((a) => a.userId === meId);
  const canApprove = techDoc.approvers.length === 0 ? canWork : !!myApprover && !myApprover.approvedAt;

  return (
    <div className="space-y-5">
      {/* header / meta */}
      <div className="rounded-xl border border-neutral-200 bg-white p-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-sm font-semibold">v{techDoc.version}</span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${techDoc.status === "approved" ? "bg-green-100 text-green-700" : "bg-neutral-100 text-neutral-600"}`}>{techDoc.status}</span>
          {techDoc.stale && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">out of date</span>}
          {techDoc.edited && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600">edited</span>}
          {techDoc.sourcePlaybookVersion && <span className="text-xs text-neutral-400">from playbook {techDoc.sourcePlaybookVersion}</span>}
          <span className="ml-auto flex flex-wrap items-center gap-x-3 text-xs text-neutral-500">
            {techDoc.groundedness != null && <span>{techDoc.groundedness}% grounded</span>}
            <span>{techDoc.provider && techDoc.model ? `${techDoc.provider}/${techDoc.model}` : "—"}</span>
            {techDoc.promptTokens != null && <span>{((techDoc.promptTokens ?? 0) + (techDoc.completionTokens ?? 0)).toLocaleString()} tok</span>}
            <span>{money(techDoc.costUsdMicros)}</span>
          </span>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {!editing ? (
            <>
              <ModelPicker modelInfo={modelInfo} model={model} setModel={setModel} />
              <button onClick={() => run("gen", () => generateTechDoc(projectId, model))} disabled={!canWork || busy === "gen"} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium disabled:opacity-40">
                {busy === "gen" ? "Regenerating…" : "Regenerate"}
              </button>
              {!locked && canWork && <button onClick={startEdit} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium">Edit</button>}
              {canWork && <button onClick={() => setShowApprovers((s) => !s)} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium">Approvers</button>}
              {canApprove && (
                <button onClick={() => run("approve", () => approveTechDoc(techDoc.id))} disabled={busy === "approve"} className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40">
                  {busy === "approve" ? "Approving…" : techDoc.approvers.length === 0 ? "Approve" : "Approve as me"}
                </button>
              )}
            </>
          ) : (
            <>
              <button
                onClick={async () => {
                  const res = await run("save", () => saveTechDocContent(techDoc.id, draft));
                  if (res && !("error" in res && res.error)) setEditing(false);
                }}
                disabled={busy === "save"}
                className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
              >
                {busy === "save" ? "Saving…" : "Save changes"}
              </button>
              <button onClick={() => { setEditing(false); setDraft(null); }} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium">Cancel</button>
            </>
          )}
        </div>

        {showApprovers && !editing && (
          <ApproverEditor
            members={members}
            approvers={techDoc.approvers}
            canWork={canWork}
            onChange={(ids) => run("approvers", () => setTechDocApprovers(techDoc.id, ids))}
          />
        )}
        {techDoc.approvers.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {techDoc.approvers.map((a) => (
              <span key={a.userId} className={`rounded-full border px-2 py-0.5 ${a.approvedAt ? "border-green-200 bg-green-50 text-green-700" : "border-neutral-200 text-neutral-500"}`}>
                {a.name} {a.approvedAt ? `✓ ${new Date(a.approvedAt).toLocaleDateString()}` : "· pending"}
              </span>
            ))}
          </div>
        )}
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>

      {/* document body */}
      <Section title="Overview"><Prose value={c.overview} editing={editing} onChange={(v) => patch({ overview: v })} /></Section>

      <div className="grid gap-5 md:grid-cols-2">
        <Section title="Goals"><StrList value={c.goals} editing={editing} onChange={(v) => patch({ goals: v })} /></Section>
        <Section title="Non-goals"><StrList value={c.nonGoals} editing={editing} onChange={(v) => patch({ nonGoals: v })} /></Section>
      </div>

      <Section title="Architecture"><Prose value={c.architectureOverview} editing={editing} onChange={(v) => patch({ architectureOverview: v })} /></Section>

      <Section title="Components">
        <Table rows={c.components} editing={editing} cols={[["name", "Component"], ["responsibility", "Responsibility"], ["tech", "Tech"]]} onChange={(rows) => patch({ components: rows })} blank={{ name: "", responsibility: "", tech: "" }} />
      </Section>
      <Section title="Data model">
        <Table rows={c.dataModel} editing={editing} cols={[["entity", "Entity"], ["fields", "Key fields"], ["notes", "Notes"]]} onChange={(rows) => patch({ dataModel: rows })} blank={{ entity: "", fields: "", notes: "" }} />
      </Section>
      <Section title="APIs / interfaces">
        <Table rows={c.apis} editing={editing} cols={[["method", "Method"], ["path", "Path"], ["purpose", "Purpose"], ["auth", "Auth"]]} onChange={(rows) => patch({ apis: rows })} blank={{ method: "", path: "", purpose: "", auth: "" }} />
      </Section>

      <Section title="Key flows"><Prose value={c.keyFlows} editing={editing} onChange={(v) => patch({ keyFlows: v })} /></Section>

      <Section title="Technology choices">
        <Table rows={c.techStack} editing={editing} cols={[["layer", "Layer"], ["choice", "Choice"], ["rationale", "Rationale"]]} onChange={(rows) => patch({ techStack: rows })} blank={{ layer: "", choice: "", rationale: "" }} />
      </Section>

      <Section title="Security & privacy"><Prose value={c.securityPrivacy} editing={editing} onChange={(v) => patch({ securityPrivacy: v })} /></Section>
      <Section title="Scalability & performance"><Prose value={c.scalabilityPerformance} editing={editing} onChange={(v) => patch({ scalabilityPerformance: v })} /></Section>
      <Section title="Observability"><Prose value={c.observability} editing={editing} onChange={(v) => patch({ observability: v })} /></Section>

      <Section title="Risks & tradeoffs">
        <Table rows={c.risksTradeoffs} editing={editing} cols={[["risk", "Risk"], ["impact", "Impact"], ["mitigation", "Mitigation"]]} onChange={(rows) => patch({ risksTradeoffs: rows })} blank={{ risk: "", impact: "", mitigation: "" }} />
      </Section>

      <Section title="Testing strategy"><Prose value={c.testingStrategy} editing={editing} onChange={(v) => patch({ testingStrategy: v })} /></Section>
      <Section title="Rollout plan"><Prose value={c.rolloutPlan} editing={editing} onChange={(v) => patch({ rolloutPlan: v })} /></Section>
      <Section title="Open questions"><StrList value={c.openQuestions} editing={editing} onChange={(v) => patch({ openQuestions: v })} /></Section>

      {c.citations.length > 0 && (
        <p className="text-xs text-neutral-400">Knowledge cited: {c.citations.join(", ")}</p>
      )}

      {/* generation log */}
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

function ModelPicker({ modelInfo, model, setModel }: { modelInfo: ModelInfo; model: string; setModel: (m: string) => void }) {
  if (!modelInfo.options.length) {
    return <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="model" className="rounded-lg border border-neutral-300 px-2 py-1.5 text-sm" />;
  }
  return (
    <select value={model} onChange={(e) => setModel(e.target.value)} className="rounded-lg border border-neutral-300 px-2 py-1.5 text-sm">
      {modelInfo.options.map((mo) => <option key={mo} value={mo}>{mo}</option>)}
    </select>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-5">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">{title}</h2>
      <div className="mt-2 text-sm text-neutral-800">{children}</div>
    </section>
  );
}

function Prose({ value, editing, onChange }: { value: string; editing: boolean; onChange: (v: string) => void }) {
  if (editing) return <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={4} className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm" />;
  return value ? <p className="whitespace-pre-wrap leading-relaxed">{value}</p> : <p className="text-neutral-400">—</p>;
}

function StrList({ value, editing, onChange }: { value: string[]; editing: boolean; onChange: (v: string[]) => void }) {
  if (editing)
    return (
      <textarea
        value={value.join("\n")}
        onChange={(e) => onChange(e.target.value.split("\n").map((s) => s.trim()).filter(Boolean))}
        rows={4}
        placeholder="One per line"
        className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
      />
    );
  if (!value.length) return <p className="text-neutral-400">—</p>;
  return <ul className="list-disc space-y-1 pl-5">{value.map((v, i) => <li key={i}>{v}</li>)}</ul>;
}

function Table<T extends Record<string, string>>({
  rows,
  cols,
  editing,
  onChange,
  blank,
}: {
  rows: T[];
  cols: [keyof T & string, string][];
  editing: boolean;
  onChange: (rows: T[]) => void;
  blank: T;
}) {
  if (!editing) {
    if (!rows.length) return <p className="text-neutral-400">—</p>;
    return (
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead><tr className="text-left text-[11px] uppercase tracking-wide text-neutral-400">{cols.map(([k, label]) => <th key={k} className="border-b border-neutral-200 px-3 py-1.5 font-medium">{label}</th>)}</tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-neutral-50 align-top">{cols.map(([k]) => <td key={k} className="px-3 py-1.5">{r[k] || "—"}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  const update = (i: number, k: keyof T & string, v: string) => onChange(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={i} className="flex flex-wrap items-start gap-2">
          {cols.map(([k, label]) => (
            <input key={k} value={r[k]} onChange={(e) => update(i, k, e.target.value)} placeholder={label} className="min-w-[8rem] flex-1 rounded-lg border border-neutral-300 px-2 py-1 text-sm" />
          ))}
          <button onClick={() => onChange(rows.filter((_, j) => j !== i))} className="rounded px-2 py-1 text-xs text-red-500 hover:bg-red-50">Remove</button>
        </div>
      ))}
      <button onClick={() => onChange([...rows, { ...blank }])} className="rounded-lg border border-neutral-300 px-3 py-1 text-xs font-medium">+ Add row</button>
    </div>
  );
}

function ApproverEditor({ members, approvers, canWork, onChange }: { members: Member[]; approvers: Approver[]; canWork: boolean; onChange: (ids: string[]) => void }) {
  const selected = new Set(approvers.map((a) => a.userId));
  return (
    <div className="mt-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
      <div className="text-xs font-medium text-neutral-600">Assigned approvers (all must approve)</div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {members.map((m) => {
          const on = selected.has(m.userId);
          return (
            <button
              key={m.userId}
              disabled={!canWork}
              onClick={() => {
                const next = new Set(selected);
                if (on) next.delete(m.userId); else next.add(m.userId);
                onChange([...next]);
              }}
              className={`rounded-full border px-2.5 py-1 text-xs ${on ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 text-neutral-600"}`}
            >
              {m.name || m.email}
            </button>
          );
        })}
      </div>
    </div>
  );
}
