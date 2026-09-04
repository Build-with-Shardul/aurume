import { redirect } from "next/navigation";
import { getSession, getActiveMembership } from "@/lib/auth-server";
import { listDiagrams } from "@/lib/diagrams";
import DiagramsList from "./diagrams-list";

export default async function DiagramsPage() {
  const session = await getSession();
  const m = await getActiveMembership();
  if (!session?.user?.id || !m?.orgId) redirect("/login");
  const diagrams = await listDiagrams(m.orgId, session.user.id);
  return <DiagramsList diagrams={diagrams} />;
}
