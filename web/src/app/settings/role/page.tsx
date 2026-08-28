import { redirect } from "next/navigation";
import { getActiveMembership } from "@/lib/auth-server";

const ROLE_DESC: Record<string, string> = {
  owner: "Full control of the workspace and every project.",
  admin: "Manage people, connectors, and all projects.",
  manager: "Create and manage projects and delivery.",
  contributor: "Work within the projects you're assigned to.",
  stakeholder: "Review and comment on artifacts.",
  finance: "Budget and cost visibility.",
  viewer: "Read-only access.",
};

export default async function RolePage() {
  const m = await getActiveMembership();
  if (!m) redirect("/login");
  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-900">
      <div className="w-full px-6 py-10">
        <h1 className="text-2xl font-semibold">My role</h1>
        <p className="mt-1 text-sm text-neutral-500">Your permission role in this workspace.</p>
        <div className="mt-6 max-w-xl rounded-xl border border-neutral-200 bg-white p-5">
          <span className="rounded-full bg-neutral-900 px-2.5 py-0.5 text-sm font-medium capitalize text-white">{m.role ?? "—"}</span>
          <p className="mt-3 text-sm text-neutral-600">{ROLE_DESC[m.role ?? ""] ?? "Your permissions in this workspace."}</p>
        </div>
      </div>
    </main>
  );
}
