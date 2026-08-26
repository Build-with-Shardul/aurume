import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { desc, eq, inArray } from "drizzle-orm";
import { getActiveMembership, canCreateProject } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { project, feature, playbook } from "@/lib/db/schema";
import FeaturesClient from "./features-client";

export default async function FeaturesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const m = await getActiveMembership();
  if (!m) redirect("/login");

  const p = (await db.select().from(project).where(eq(project.id, id)).limit(1))[0];
  if (!p || p.organizationId !== m.orgId) notFound();

  const features = await db
    .select()
    .from(feature)
    .where(eq(feature.projectId, id))
    .orderBy(desc(feature.createdAt));

  const ids = features.map((f) => f.id);
  const pbs = ids.length
    ? await db.select({ featureId: playbook.featureId, status: playbook.status, groundedness: playbook.groundedness, version: playbook.version }).from(playbook).where(inArray(playbook.featureId, ids))
    : [];
  const latest = new Map<string, { status: string; groundedness: number | null; version: number }>();
  for (const pb of pbs) {
    const cur = latest.get(pb.featureId);
    if (!cur || pb.version > cur.version) latest.set(pb.featureId, { status: pb.status, groundedness: pb.groundedness, version: pb.version });
  }

  const items = features.map((f) => ({
    id: f.id,
    title: f.title,
    brief: f.brief,
    playbook: latest.get(f.id) ?? null,
  }));

  const canWork = canCreateProject(m.role) || p.createdBy === m.userId;

  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-900">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link href="/" className="font-semibold">Aurume</Link>
          <span className="text-sm text-neutral-500">{m.role}</span>
        </div>
      </header>
      <div className="mx-auto max-w-3xl px-6 py-10">
        <Link href={`/projects/${id}`} className="text-sm text-neutral-500 hover:text-neutral-900">← {p.name}</Link>
        <h1 className="mt-3 text-2xl font-semibold">Features</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Each feature gets a grounded, structured playbook — the head of the delivery chain. Aurume drafts it from this
          project&apos;s and your organization&apos;s knowledge; you review and approve.
        </p>
        <div className="mt-8">
          <FeaturesClient projectId={id} items={items} canWork={canWork} />
        </div>
      </div>
    </main>
  );
}
