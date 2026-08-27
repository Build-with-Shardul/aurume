import { redirect } from "next/navigation";
import Link from "next/link";
import { asc, eq, inArray } from "drizzle-orm";
import { getActiveMembership, canManageOrg } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { member, user, projectMember, project, leave } from "@/lib/db/schema";
import { DISCIPLINE_LABEL } from "@/lib/permissions";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-900">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="font-semibold">Aurume</Link>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-6 py-10">{children}</div>
    </main>
  );
}

export default async function ResourcesPage() {
  const m = await getActiveMembership();
  if (!m) redirect("/login");
  if (!m.orgId) redirect("/");
  if (!canManageOrg(m.role)) {
    return (
      <Shell>
        <Link href="/" className="text-sm text-neutral-500 hover:text-neutral-900">← Back</Link>
        <h1 className="mt-3 text-2xl font-semibold">Resources</h1>
        <p className="mt-2 text-sm text-neutral-500">Only owners and admins can view the resource directory.</p>
      </Shell>
    );
  }

  const people = await db
    .select({ userId: member.userId, name: user.name, email: user.email, discipline: member.discipline })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(eq(member.organizationId, m.orgId))
    .orderBy(asc(user.name));

  const ids = people.map((p) => p.userId);
  const pmRows = ids.length ? await db.select({ userId: projectMember.userId, projectId: projectMember.projectId, name: project.name }).from(projectMember).innerJoin(project, eq(project.id, projectMember.projectId)).where(inArray(projectMember.userId, ids)) : [];
  const leaveRows = ids.length ? await db.select({ userId: leave.userId }).from(leave).where(eq(leave.organizationId, m.orgId)) : [];
  const projById = new Map<string, string[]>();
  for (const r of pmRows) { const arr = projById.get(r.userId) ?? []; arr.push(r.name); projById.set(r.userId, arr); }
  const leaveCount = new Map<string, number>();
  for (const r of leaveRows) leaveCount.set(r.userId, (leaveCount.get(r.userId) ?? 0) + 1);

  return (
    <Shell>
      <Link href="/" className="text-sm text-neutral-500 hover:text-neutral-900">← Back</Link>
      <h1 className="mt-3 text-2xl font-semibold">Resources</h1>
      <p className="mt-1 text-sm text-neutral-500">Everyone in the organization and the projects they&apos;re on. Open a resource to see their cross-project allocation and manage leave.</p>

      <div className="mt-8 rounded-xl border border-neutral-200 bg-white">
        <table className="w-full border-collapse text-sm">
          <thead><tr className="border-b border-neutral-100 text-left text-[11px] uppercase tracking-wide text-neutral-400"><th className="px-4 py-2">Name</th><th className="px-4 py-2">Role</th><th className="px-4 py-2">Projects</th><th className="px-4 py-2">Leave entries</th></tr></thead>
          <tbody>
            {people.map((p) => {
              const projs = projById.get(p.userId) ?? [];
              return (
                <tr key={p.userId} className="border-b border-neutral-50 hover:bg-neutral-50">
                  <td className="px-4 py-2"><Link href={`/resources/${p.userId}`} className="font-medium text-neutral-900 hover:underline">{p.name || p.email}</Link></td>
                  <td className="px-4 py-2 text-neutral-500">{p.discipline ? DISCIPLINE_LABEL[p.discipline] ?? p.discipline : "—"}</td>
                  <td className="px-4 py-2 text-neutral-500">{projs.length ? `${projs.length} · ${projs.slice(0, 3).join(", ")}${projs.length > 3 ? "…" : ""}` : "—"}</td>
                  <td className="px-4 py-2 text-neutral-500">{leaveCount.get(p.userId) ?? 0}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
