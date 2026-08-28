import { redirect } from "next/navigation";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getActiveMembership, canManageOrg } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { aiGeneration, project } from "@/lib/db/schema";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-900">
      <div className="w-full px-6 py-10">{children}</div>
    </main>
  );
}

const th = "px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-neutral-400";
const td = "px-3 py-2 text-sm text-neutral-800";
const fmt = (n: number) => n.toLocaleString();
const usd = (micros: number) => `$${(micros / 1e6).toFixed(2)}`;

export default async function UsagePage() {
  const m = await getActiveMembership();
  if (!m) redirect("/login");
  if (!m.orgId) redirect("/");
  if (!canManageOrg(m.role)) {
    return (
      <Shell>
        <Link href="/" className="text-sm text-neutral-500 hover:text-neutral-900">← Back</Link>
        <h1 className="mt-3 text-2xl font-semibold">AI usage</h1>
        <p className="mt-2 text-sm text-neutral-500">Only owners and admins can view organization usage.</p>
      </Shell>
    );
  }

  const rows = await db
    .select({
      projectId: aiGeneration.projectId,
      projectName: project.name,
      provider: aiGeneration.provider,
      model: aiGeneration.model,
      prompt: aiGeneration.promptTokens,
      completion: aiGeneration.completionTokens,
      cost: aiGeneration.costUsdMicros,
      outcome: aiGeneration.outcome,
      createdAt: aiGeneration.createdAt,
    })
    .from(aiGeneration)
    .leftJoin(project, eq(project.id, aiGeneration.projectId))
    .where(eq(aiGeneration.organizationId, m.orgId))
    .orderBy(desc(aiGeneration.createdAt));

  const tok = (r: (typeof rows)[number]) => (r.prompt ?? 0) + (r.completion ?? 0);
  const totalTokens = rows.reduce((s, r) => s + tok(r), 0);
  const totalPrompt = rows.reduce((s, r) => s + (r.prompt ?? 0), 0);
  const totalCompletion = rows.reduce((s, r) => s + (r.completion ?? 0), 0);
  const totalCost = rows.reduce((s, r) => s + (r.cost ?? 0), 0);
  const anyCost = rows.some((r) => r.cost != null);

  function groupBy(keyOf: (r: (typeof rows)[number]) => string, labelOf: (r: (typeof rows)[number]) => string) {
    const map = new Map<string, { label: string; count: number; tokens: number; cost: number; hasCost: boolean }>();
    for (const r of rows) {
      const k = keyOf(r);
      const cur = map.get(k) ?? { label: labelOf(r), count: 0, tokens: 0, cost: 0, hasCost: false };
      cur.count++;
      cur.tokens += tok(r);
      cur.cost += r.cost ?? 0;
      cur.hasCost = cur.hasCost || r.cost != null;
      map.set(k, cur);
    }
    return [...map.values()].sort((a, b) => b.tokens - a.tokens);
  }

  const byModel = groupBy((r) => `${r.provider ?? "?"}/${r.model ?? "?"}`, (r) => `${r.provider ?? "?"}/${r.model ?? "?"}`);
  const byProject = groupBy((r) => r.projectId ?? "none", (r) => r.projectName ?? "(deleted / none)");
  const recent = rows.slice(0, 20);

  return (
    <Shell>
      <Link href="/" className="text-sm text-neutral-500 hover:text-neutral-900">← Back</Link>
      <h1 className="mt-3 text-2xl font-semibold">AI usage</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Cumulative tokens and estimated cost of every AI generation across this organization. Cost is an estimate from
        public per-model rates; unmapped models show tokens only.
      </p>

      {/* totals */}
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card label="Generations" value={fmt(rows.length)} />
        <Card label="Total tokens" value={fmt(totalTokens)} sub={`${fmt(totalPrompt)} in · ${fmt(totalCompletion)} out`} />
        <Card label="Est. cost" value={anyCost ? usd(totalCost) : "—"} />
        <Card label="Avg tokens / gen" value={rows.length ? fmt(Math.round(totalTokens / rows.length)) : "0"} />
      </div>

      {rows.length === 0 ? (
        <p className="mt-8 rounded-xl border border-dashed border-neutral-300 bg-white p-10 text-center text-sm text-neutral-400">
          No AI generations yet.
        </p>
      ) : (
        <>
          <Section title="By model">
            <Table
              head={["Model", "Generations", "Tokens", "Est. cost"]}
              rows={byModel.map((g) => [g.label, fmt(g.count), fmt(g.tokens), g.hasCost ? usd(g.cost) : "—"])}
            />
          </Section>

          <Section title="By project">
            <Table
              head={["Project", "Generations", "Tokens", "Est. cost"]}
              rows={byProject.map((g) => [g.label, fmt(g.count), fmt(g.tokens), g.hasCost ? usd(g.cost) : "—"])}
            />
          </Section>

          <Section title="Recent generations">
            <Table
              head={["When", "Project", "Model", "Tokens (in/out)", "Cost", "Outcome"]}
              rows={recent.map((r) => [
                r.createdAt.toLocaleString(),
                r.projectName ?? "—",
                `${r.provider ?? "?"}/${r.model ?? "?"}`,
                `${fmt(tok(r))} (${fmt(r.prompt ?? 0)}/${fmt(r.completion ?? 0)})`,
                r.cost != null ? usd(r.cost) : "—",
                r.outcome,
              ])}
            />
          </Section>
        </>
      )}
    </Shell>
  );
}

function Card({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-neutral-400">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-neutral-400">{sub}</div>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-8">
      <h2 className="mb-2 text-sm font-semibold">{title}</h2>
      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">{children}</div>
    </div>
  );
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr className="border-b border-neutral-100">
          {head.map((h) => <th key={h} className={th}>{h}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-b border-neutral-50 last:border-b-0">
            {r.map((c, j) => <td key={j} className={td}>{c}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
