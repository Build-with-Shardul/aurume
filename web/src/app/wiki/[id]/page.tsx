import { notFound, redirect } from "next/navigation";
import { getSession, getActiveMembership } from "@/lib/auth-server";
import { getReadableDocument, canEditDocument, getDocumentMeta } from "@/lib/wiki";
import DocumentView from "./document-view";

function fmtDate(d: Date | null) {
  if (!d) return "";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(d);
}

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  const m = await getActiveMembership();
  if (!session?.user?.id || !m?.orgId) redirect("/login");

  const doc = await getReadableDocument(m.orgId, session.user.id, id);
  if (!doc) notFound(); // access rule: not readable → 404 (never leaks existence/content)

  const editable = canEditDocument(doc, session.user.id);
  const meta = await getDocumentMeta(doc);
  const words = (doc.contentText || "").trim().split(/\s+/).filter(Boolean).length;
  const readMinutes = Math.max(1, Math.round(words / 200));

  return (
    <DocumentView
      key={doc.id}
      id={doc.id}
      title={doc.title}
      body={doc.body ?? null}
      icon={doc.icon}
      visibility={doc.visibility as "workspace" | "private"}
      archived={doc.archived}
      editable={editable}
      authorName={meta.authorName}
      lastEditedByName={meta.lastEditedByName}
      createdLabel={fmtDate(doc.createdAt)}
      updatedLabel={fmtDate(doc.updatedAt)}
      readMinutes={readMinutes}
      totalViews={meta.totalViews}
      viewsByDate={meta.viewsByDate}
    />
  );
}
