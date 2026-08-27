import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { getActiveMembership, canCreateProject } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { project, playbook, epic, story } from "@/lib/db/schema";
import EpicsClient from "./epics-client";

export default async function EpicsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const m = await getActiveMembership();
  if (!m) redirect("/login");

  const p = (await db.select().from(project).where(eq(project.id, id)).limit(1))[0];
  if (!p || p.organizationId !== m.orgId) notFound();

  const pb = (await db.select({ version: playbook.version, status: playbook.status }).from(playbook).where(eq(playbook.projectId, id)).orderBy(desc(playbook.version)).limit(1))[0] ?? null;

  const epics = await db.select().from(epic).where(eq(epic.projectId, id)).orderBy(asc(epic.orderIndex), asc(epic.createdAt));
  const epicIds = epics.map((e) => e.id);
  const stories = epicIds.length
    ? await db.select({ epicId: story.epicId, status: story.status, points: story.points }).from(story).where(inArray(story.epicId, epicIds))
    : [];
  const counts = new Map<string, { total: number; approved: number; points: number }>();
  for (const s of stories) {
    const c = counts.get(s.epicId) ?? { total: 0, approved: 0, points: 0 };
    c.total++;
    if (s.status === "approved") c.approved++;
    c.points += s.points ?? 0;
    counts.set(s.epicId, c);
  }

  const items = epics.map((e) => ({
    id: e.id,
    name: e.name,
    scopeDetail: e.scopeDetail,
    jiraId: e.jiraId,
    stories: counts.get(e.id) ?? { total: 0, approved: 0, points: 0 },
  }));

  const canWork = canCreateProject(m.role) || p.createdBy === m.userId;

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
        <h1 className="mt-3 text-2xl font-semibold">Epics & stories</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Break the product playbook into epics, then generate grounded user stories under each. Agents propose; you
          review and approve.
        </p>
        <div className="mt-8">
          <EpicsClient
            projectId={id}
            items={items}
            canWork={canWork}
            hasPlaybook={!!pb}
            playbookLabel={pb ? `playbook v${pb.version} · ${pb.status}` : null}
          />
        </div>
      </div>
    </main>
  );
}
