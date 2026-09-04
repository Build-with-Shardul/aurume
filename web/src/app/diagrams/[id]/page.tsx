import { notFound, redirect } from "next/navigation";
import { getSession, getActiveMembership } from "@/lib/auth-server";
import { getReadableDiagram, canEditDiagram, getDiagramMeta, listDiagramComments, listDiagramReactions, listDiagramShares, listShareableDiagramUsers, listDiagramProjectOptions } from "@/lib/diagrams";
import DrawioEditor from "./drawio-editor";

function fmtDate(d: Date | null) {
  if (!d) return "";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(d);
}

export default async function DiagramEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  const m = await getActiveMembership();
  if (!session?.user?.id || !m?.orgId) redirect("/login");

  const d = await getReadableDiagram(m.orgId, session.user.id, id);
  if (!d) notFound();

  const editable = canEditDiagram(d, session.user.id);
  const [meta, comments, reactions, shares, shareableUsers, projectOptions] = await Promise.all([
    getDiagramMeta(d),
    listDiagramComments(d.id),
    listDiagramReactions(d.id, session.user.id),
    listDiagramShares(d.id),
    editable ? listShareableDiagramUsers(m.orgId, d.id, d.authorId) : Promise.resolve([]),
    editable ? listDiagramProjectOptions(m.orgId, session.user.id, d.id) : Promise.resolve([]),
  ]);

  return (
    <DrawioEditor
      id={d.id}
      title={d.title}
      xml={d.xml ?? ""}
      editable={editable}
      currentUserId={session.user.id}
      authorName={meta.authorName}
      lastEditedByName={meta.lastEditedByName}
      createdLabel={fmtDate(d.createdAt)}
      updatedLabel={fmtDate(d.updatedAt)}
      totalViews={meta.totalViews}
      projects={meta.projects}
      reactions={reactions}
      comments={comments}
      shares={shares}
      shareableUsers={shareableUsers}
      projectOptions={projectOptions}
    />
  );
}
