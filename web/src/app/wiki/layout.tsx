import { redirect } from "next/navigation";
import { getSession, getActiveMembership } from "@/lib/auth-server";
import { listWikiTree } from "@/lib/wiki";
import WikiSidebar from "./wiki-sidebar";

export default async function WikiLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const m = await getActiveMembership();
  if (!session?.user?.id || !m?.orgId) redirect("/login");
  const nodes = await listWikiTree(m.orgId, session.user.id);
  return (
    <div className="flex h-full min-h-0">
      <WikiSidebar nodes={nodes} userId={session.user.id} />
      <div className="min-w-0 flex-1 overflow-y-auto bg-white">{children}</div>
    </div>
  );
}
