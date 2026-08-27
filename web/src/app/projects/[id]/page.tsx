import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { getActiveMembership, canManageOrg } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { project, projectMember, knowledgeItem, feature } from "@/lib/db/schema";
import { formatBudget } from "@/lib/currencies";
import { isoToMmddyyyy, isProjectStarted } from "@/lib/dates";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const m = await getActiveMembership();
  if (!m) redirect("/login");

  const p = (await db.select().from(project).where(eq(project.id, id)).limit(1))[0];
  if (!p || p.organizationId !== m.orgId) notFound();

  const memberCount = (
    await db.select({ userId: projectMember.userId }).from(projectMember).where(eq(projectMember.projectId, id))
  ).length;
  const knowledgeCount = (
    await db.select({ id: knowledgeItem.id }).from(knowledgeItem).where(eq(knowledgeItem.projectId, id))
  ).length;
  const featureCount = (
    await db.select({ id: feature.id }).from(feature).where(eq(feature.projectId, id))
  ).length;

  const canManage = canManageOrg(m.role) || p.createdBy === m.userId;
  const started = isProjectStarted(p.startDate);

  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-900">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="font-semibold">Aurume</Link>
          <span className="text-sm text-neutral-500">{m.role}</span>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-6 py-10">
        <Link href="/projects" className="text-sm text-neutral-500 hover:text-neutral-900">← Projects</Link>
        <div className="mt-3 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold">{p.name}</h1>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${started ? "bg-green-100 text-green-700" : "bg-neutral-100 text-neutral-500"}`}>
                {started ? "Started" : "Not started"}
              </span>
            </div>
            <p className="mt-1 text-xs text-neutral-400">Project ID: <span className="font-mono">{p.id}</span></p>
            {p.description && <p className="mt-2 text-neutral-600">{p.description}</p>}
          </div>
          <Link
            href={`/projects/${id}/settings`}
            className="shrink-0 rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium hover:bg-white"
            aria-label="Project settings"
          >
            ⚙ Settings
          </Link>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field label="Budget" value={formatBudget(p.budget, p.currency)} />
          <Field label="Members" value={String(memberCount)} />
          <Field label="Expected start" value={isoToMmddyyyy(p.startDate) || "—"} />
          <Field label="Expected end" value={isoToMmddyyyy(p.endDate) || "—"} />
        </div>

        <Link
          href={`/projects/${id}/knowledge`}
          className="mt-6 flex items-center justify-between rounded-xl border border-neutral-200 bg-white p-5 hover:border-neutral-400"
        >
          <div>
            <div className="font-medium">📚 Knowledge space</div>
            <p className="mt-1 text-sm text-neutral-500">
              Upload docs, spreadsheets, PDFs, images — anything. Aurume references it when drafting the playbook.
            </p>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-lg font-semibold">{knowledgeCount}</div>
            <div className="text-xs text-neutral-400">item{knowledgeCount === 1 ? "" : "s"}</div>
          </div>
        </Link>

        <Link
          href={`/projects/${id}/features`}
          className="mt-4 flex items-center justify-between rounded-xl border border-neutral-200 bg-white p-5 hover:border-neutral-400"
        >
          <div>
            <div className="font-medium">🧭 Features & product playbook</div>
            <p className="mt-1 text-sm text-neutral-500">
              Add the product&apos;s features; Aurume synthesizes them into one grounded product playbook to review and approve.
            </p>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-lg font-semibold">{featureCount}</div>
            <div className="text-xs text-neutral-400">feature{featureCount === 1 ? "" : "s"}</div>
          </div>
        </Link>
      </div>
    </main>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-3">
      <div className="text-xs uppercase tracking-wide text-neutral-400">{label}</div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}
