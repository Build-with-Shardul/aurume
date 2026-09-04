import { notFound, redirect } from "next/navigation";
import { getSession, getActiveMembership } from "@/lib/auth-server";
import { getReadableDocument, canEditDocument, getDocumentMeta, listReactions, listComments, listShares, listShareableUsers, listMentionableUsers, listReferenceablePages } from "@/lib/wiki";
import { listEmbeddableDiagrams } from "@/lib/diagrams";
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
  const [reactions, comments, shares, shareableUsers, mentionableUsers, pageRefs, diagrams] = await Promise.all([
    listReactions(doc.id, session.user.id),
    listComments(doc.id),
    listShares(doc.id),
    editable ? listShareableUsers(m.orgId!, doc.id, doc.authorId) : Promise.resolve([]),
    listMentionableUsers(m.orgId!, session.user.id, doc.id),
    listReferenceablePages(m.orgId!, session.user.id, doc.id),
    listEmbeddableDiagrams(m.orgId!),
  ]);
  const words = ((doc.publishedContentText ?? doc.contentText) || "").trim().split(/\s+/).filter(Boolean).length;
  const readMinutes = Math.max(1, Math.round(words / 200));
  // Readers see the published copy (falling back to working for pages published before
  // staged-changes existed / for the author's own draft). Editors also get the working copy.
  const readBody = doc.publishedBody ?? doc.body ?? null;
  const workingBody = editable ? doc.body ?? null : null;

  return (
    <DocumentView
      key={doc.id}
      id={doc.id}
      title={doc.title}
      readBody={readBody}
      workingBody={workingBody}
      icon={doc.icon}
      visibility={doc.visibility as "workspace" | "private"}
      status={doc.status as "draft" | "published"}
      hasUnpublishedChanges={doc.hasUnpublishedChanges}
      archived={doc.archived}
      editable={editable}
      authorName={meta.authorName}
      lastEditedByName={meta.lastEditedByName}
      createdLabel={fmtDate(doc.createdAt)}
      updatedLabel={fmtDate(doc.updatedAt)}
      readMinutes={readMinutes}
      totalViews={meta.totalViews}
      viewsByDate={meta.viewsByDate}
      sharedWith={meta.sharedWith}
      shares={shares}
      shareableUsers={shareableUsers}
      reactions={reactions}
      comments={comments}
      currentUserId={session.user.id}
      mentionableUsers={mentionableUsers}
      pageRefs={pageRefs}
      diagrams={diagrams}
    />
  );
}
