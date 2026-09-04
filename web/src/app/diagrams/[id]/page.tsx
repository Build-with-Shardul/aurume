import { notFound, redirect } from "next/navigation";
import { getSession, getActiveMembership } from "@/lib/auth-server";
import { getReadableDiagram } from "@/lib/diagrams";
import DrawioEditor from "./drawio-editor";

export default async function DiagramEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  const m = await getActiveMembership();
  if (!session?.user?.id || !m?.orgId) redirect("/login");

  const d = await getReadableDiagram(m.orgId, session.user.id, id);
  if (!d) notFound();

  return <DrawioEditor id={d.id} title={d.title} xml={d.xml ?? ""} />;
}
