import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { getActiveMembership, canCreateProject } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { project, playbook, techDoc, techDocApprover, member, user, aiGeneration } from "@/lib/db/schema";
import { currentProvider, MODEL_OPTIONS, defaultModel } from "@/lib/ai/provider";
import TechDocWorkspace, { type TechDocView } from "./tdd-client";

export default async function TddPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const m = await getActiveMembership();
  if (!m) redirect("/login");

  const p = (await db.select().from(project).where(eq(project.id, id)).limit(1))[0];
  if (!p || p.organizationId !== m.orgId) notFound();

  const td = (await db.select().from(techDoc).where(eq(techDoc.projectId, id)).orderBy(desc(techDoc.version)).limit(1))[0] ?? null;
  const pb = (await db.select({ version: playbook.version, status: playbook.status }).from(playbook).where(eq(playbook.projectId, id)).orderBy(desc(playbook.version)).limit(1))[0] ?? null;

  const members = await db
    .select({ userId: member.userId, name: user.name, email: user.email, discipline: member.discipline })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(eq(member.organizationId, m.orgId!));

  const approverRows = td
    ? await db
        .select({ userId: techDocApprover.userId, name: user.name, email: user.email, approvedAt: techDocApprover.approvedAt })
        .from(techDocApprover)
        .innerJoin(user, eq(user.id, techDocApprover.userId))
        .where(eq(techDocApprover.techDocId, td.id))
    : [];

  const gen = td
    ? (await db
        .select({ prompt: aiGeneration.promptTokens, completion: aiGeneration.completionTokens, cost: aiGeneration.costUsdMicros })
        .from(aiGeneration)
        .where(eq(aiGeneration.playbookId, td.id))
        .orderBy(desc(aiGeneration.createdAt))
        .limit(1))[0] ?? null
    : null;

  const logRows = await db
    .select({
      version: techDoc.version,
      createdAt: aiGeneration.createdAt,
      model: aiGeneration.model,
      provider: aiGeneration.provider,
      prompt: aiGeneration.promptTokens,
      completion: aiGeneration.completionTokens,
      cost: aiGeneration.costUsdMicros,
      groundedness: aiGeneration.groundedness,
      outcome: aiGeneration.outcome,
    })
    .from(aiGeneration)
    .leftJoin(techDoc, eq(techDoc.id, aiGeneration.playbookId))
    .where(and(eq(aiGeneration.projectId, id), eq(aiGeneration.kind, "techdoc")))
    .orderBy(desc(aiGeneration.createdAt));

  const generationLog = logRows.map((r) => ({
    version: r.version ?? null,
    at: r.createdAt.toISOString(),
    model: r.provider && r.model ? `${r.provider}/${r.model}` : r.model ?? "—",
    tokens: (r.prompt ?? 0) + (r.completion ?? 0),
    costUsdMicros: r.cost ?? null,
    groundedness: r.groundedness,
    outcome: r.outcome,
  }));

  const provider = currentProvider();
  const modelInfo = { provider, options: MODEL_OPTIONS[provider], defaultModel: defaultModel(provider) };
  const canWork = canCreateProject(m.role) || p.createdBy === m.userId;

  const view: TechDocView | null = td
    ? {
        id: td.id,
        version: td.version,
        status: td.status,
        stale: td.stale,
        content: td.content as TechDocView["content"],
        groundedness: td.groundedness,
        provider: td.provider,
        model: td.model,
        edited: td.edited,
        sourcePlaybookVersion: td.sourcePlaybookVersion,
        approvers: approverRows.map((a) => ({ userId: a.userId, name: a.name || a.email, approvedAt: a.approvedAt ? a.approvedAt.toISOString() : null })),
        promptTokens: gen?.prompt ?? null,
        completionTokens: gen?.completion ?? null,
        costUsdMicros: gen?.cost ?? null,
      }
    : null;

  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-900">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="font-semibold">Aurume</Link>
          <span className="text-sm text-neutral-500">{m.role}</span>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-6 py-10">
        <Link href={`/projects/${id}`} className="text-sm text-neutral-500 hover:text-neutral-900">← {p.name}</Link>
        <h1 className="mt-3 text-2xl font-semibold">Technical Design Document</h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-500">
          The technical counterpart to the product playbook — architecture, data model, APIs, security, and rollout. Grounded
          in the playbook, features, compliance, and knowledge; review, edit, and approve it like the playbook.
        </p>
        <div className="mt-8">
          <TechDocWorkspace
            projectId={id}
            techDoc={view}
            members={members}
            canWork={canWork}
            meId={m.userId}
            modelInfo={modelInfo}
            playbookLabel={pb ? `v${pb.version} · ${pb.status}` : null}
            generationLog={generationLog}
          />
        </div>
      </div>
    </main>
  );
}
