import { redirect } from "next/navigation";
import Link from "next/link";
import { getActiveMembership } from "@/lib/auth-server";
import { listOrgKnowledge, canDeleteOrgItem } from "@/lib/knowledge";
import KnowledgeClient, { type KnowledgeItemView } from "../projects/[id]/knowledge/knowledge-client";
import { addOrgKnowledgeNote, deleteOrgKnowledgeItem } from "./actions";

export default async function OrgKnowledgePage() {
  const m = await getActiveMembership();
  if (!m) redirect("/login");
  if (!m.orgId) redirect("/");

  const rows = await listOrgKnowledge(m.orgId);

  const items: KnowledgeItemView[] = rows.map((r) => ({
    id: r.id,
    source: r.source,
    title: r.title,
    mimeType: r.mimeType,
    sizeBytes: r.sizeBytes,
    storageKey: r.storageKey,
    uploaderName: r.uploaderName,
    uploaderEmail: r.uploaderEmail,
    createdAt: r.createdAt,
    // Org-level items are managed here; project items are managed in their project.
    canDelete: r.projectId == null && canDeleteOrgItem(r, m),
    scopeLabel: r.projectId == null ? "Workspace-wide" : r.projectName ?? "Project",
    scopeHref: r.projectId == null ? null : `/projects/${r.projectId}/knowledge`,
  }));

  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-900">
      <div className="w-full px-6 py-10">
        <Link href="/" className="text-sm text-neutral-500 hover:text-neutral-900">← Back</Link>
        <h1 className="mt-3 text-2xl font-semibold">Workspace knowledge</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Your workspace&apos;s shared knowledge base. Every project&apos;s knowledge rolls up here, and you can add
          workspace-wide references directly. New projects draw on all of this — plus their own project knowledge — when
          Aurume drafts playbooks and other artifacts.
        </p>

        <div className="mt-8">
          <KnowledgeClient
            items={items}
            uploadUrl="/api/knowledge"
            downloadBase="/api/knowledge"
            addNoteAction={addOrgKnowledgeNote}
            deleteAction={deleteOrgKnowledgeItem}
            emptyHint="No workspace knowledge yet. Upload workspace-wide references, or add knowledge inside any project — it will roll up here."
          />
        </div>
      </div>
    </main>
  );
}
