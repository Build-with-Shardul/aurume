import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getActiveMembership, canManageOrg } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { project, knowledgeItem, user } from "@/lib/db/schema";
import { canDeleteItem } from "@/lib/knowledge";
import KnowledgeClient, { type KnowledgeItemView } from "./knowledge-client";
import { addKnowledgeNote, deleteKnowledgeItem } from "./actions";

export default async function KnowledgePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const m = await getActiveMembership();
  if (!m) redirect("/login");

  const p = (await db.select().from(project).where(eq(project.id, id)).limit(1))[0];
  if (!p || p.organizationId !== m.orgId) notFound();

  const rows = await db
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

  const items: KnowledgeItemView[] = rows.map((r) => ({
    ...r,
    canDelete: canDeleteItem(r, p, m),
  }));

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
        <h1 className="mt-3 text-2xl font-semibold">Knowledge space</h1>
        <p className="mt-1 text-sm text-neutral-500">
          This project&apos;s knowledge. Aurume also draws on your{" "}
          <Link href="/knowledge" className="font-medium text-neutral-900 underline">organization knowledge</Link>{" "}
          (every project&apos;s knowledge, rolled up) when drafting playbooks and other artifacts.
        </p>

        <div className="mt-8">
          <KnowledgeClient
            items={items}
            uploadUrl={`/api/projects/${id}/knowledge`}
            downloadBase={`/api/projects/${id}/knowledge`}
            addNoteAction={addKnowledgeNote.bind(null, id)}
            deleteAction={deleteKnowledgeItem.bind(null, id)}
            emptyHint="Nothing here yet. Upload documents, spreadsheets, PDFs, images — anything the team knows about this project."
          />
        </div>
      </div>
    </main>
  );
}
