import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getActiveMembership, canManageOrg } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { project, knowledgeItem, user } from "@/lib/db/schema";
import KnowledgeClient from "./knowledge-client";

export default async function KnowledgePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const m = await getActiveMembership();
  if (!m) redirect("/login");

  const p = (await db.select().from(project).where(eq(project.id, id)).limit(1))[0];
  if (!p || p.organizationId !== m.orgId) notFound();

  const items = await db
    .select({
      id: knowledgeItem.id,
      source: knowledgeItem.source,
      title: knowledgeItem.title,
      mimeType: knowledgeItem.mimeType,
      sizeBytes: knowledgeItem.sizeBytes,
      storageKey: knowledgeItem.storageKey,
      uploadedBy: knowledgeItem.uploadedBy,
      uploaderName: user.name,
      uploaderEmail: user.email,
      createdAt: knowledgeItem.createdAt,
    })
    .from(knowledgeItem)
    .leftJoin(user, eq(user.id, knowledgeItem.uploadedBy))
    .where(eq(knowledgeItem.projectId, id))
    .orderBy(desc(knowledgeItem.createdAt));

  const canManage = canManageOrg(m.role) || p.createdBy === m.userId;

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
        <h1 className="mt-3 text-2xl font-semibold">Knowledge space</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Everything the team knows about this project. Aurume references this when drafting playbooks and other
          artifacts, and will keep it current from file uploads and connected Slack &amp; Teams discussions.
        </p>

        <div className="mt-8">
          <KnowledgeClient projectId={id} items={items} meId={m.userId} canManage={canManage} />
        </div>
      </div>
    </main>
  );
}
