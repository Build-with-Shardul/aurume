import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getSession, getActiveMembership } from "@/lib/auth-server";
import { getReadableDocument, canEditDocument, listHistory } from "@/lib/wiki";
import HistoryView from "./history-view";

export default async function HistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  const m = await getActiveMembership();
  if (!session?.user?.id || !m?.orgId) redirect("/login");

  const doc = await getReadableDocument(m.orgId, session.user.id, id);
  if (!doc) notFound();

  const editable = canEditDocument(doc, session.user.id);
  const items = await listHistory(doc.id);

  return (
    <div className="mx-auto max-w-3xl px-8 py-8">
      <Link href={`/wiki/${id}`} className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900">
        <span aria-hidden>←</span> Back to page
      </Link>
      <h1 className="mt-3 text-2xl font-bold text-neutral-900">{doc.title || "Untitled"}</h1>
      <p className="mt-0.5 text-sm text-neutral-400">Version history</p>
      <HistoryView docId={id} items={items} editable={editable} />
    </div>
  );
}
