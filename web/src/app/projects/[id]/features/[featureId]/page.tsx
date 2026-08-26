import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getActiveMembership, canCreateProject } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { project, feature, playbook } from "@/lib/db/schema";
import PlaybookClient from "./playbook-client";

export default async function FeaturePage({ params }: { params: Promise<{ id: string; featureId: string }> }) {
  const { id, featureId } = await params;
  const m = await getActiveMembership();
  if (!m) redirect("/login");

  const f = (await db.select().from(feature).where(eq(feature.id, featureId)).limit(1))[0];
  if (!f || f.projectId !== id || f.organizationId !== m.orgId) notFound();
  const p = (await db.select().from(project).where(eq(project.id, id)).limit(1))[0];
  if (!p) notFound();

  const pb =
    (await db.select().from(playbook).where(eq(playbook.featureId, featureId)).orderBy(desc(playbook.version)).limit(1))[0] ?? null;

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
        <Link href={`/projects/${id}/features`} className="text-sm text-neutral-500 hover:text-neutral-900">← Features</Link>
        <h1 className="mt-3 text-2xl font-semibold">{f.title}</h1>
        {f.brief && <p className="mt-1 text-neutral-600">{f.brief}</p>}

        <div className="mt-8">
          <PlaybookClient
            featureId={featureId}
            canWork={canWork}
            playbook={
              pb
                ? {
                    id: pb.id,
                    version: pb.version,
                    status: pb.status,
                    content: pb.content as { summary: string; sections: { key: string; heading: string; content: string; citations: string[] }[] },
                    groundedness: pb.groundedness,
                    provider: pb.provider,
                    model: pb.model,
                    edited: pb.edited,
                  }
                : null
            }
          />
        </div>
      </div>
    </main>
  );
}
