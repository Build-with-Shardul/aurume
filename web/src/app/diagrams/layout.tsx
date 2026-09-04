import { redirect } from "next/navigation";
import { getSession, getActiveMembership } from "@/lib/auth-server";
import { listDiagramTree } from "@/lib/diagrams";
import DiagramSidebar from "./diagram-sidebar";

export default async function DiagramsLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const m = await getActiveMembership();
  if (!session?.user?.id || !m?.orgId) redirect("/login");
  const nodes = await listDiagramTree(m.orgId, session.user.id);
  return (
    <div className="flex h-full min-h-0">
      <DiagramSidebar nodes={nodes} userId={session.user.id} />
      <div className="min-w-0 flex-1 overflow-y-auto bg-white">{children}</div>
    </div>
  );
}
