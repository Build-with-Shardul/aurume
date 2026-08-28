import { redirect } from "next/navigation";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getSession, getActiveMembership, canCreateProject } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { project } from "@/lib/db/schema";
import { formatBudget } from "@/lib/currencies";
import { isoToMmddyyyy } from "@/lib/dates";

export default async function ProjectsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const m = await getActiveMembership();

  const projects = m?.orgId
    ? await db.select().from(project).where(eq(project.organizationId, m.orgId)).orderBy(desc(project.createdAt))
    : [];
  const canCreate = canCreateProject(m?.role ?? null);

  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-900">
      <div className="w-full px-6 py-10">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Projects</h1>
          {canCreate && (
            <Link href="/projects/new" className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800">
              + New project
            </Link>
          )}
        </div>

        {projects.length === 0 ? (
          <div className="mt-8 rounded-xl border border-dashed border-neutral-300 bg-white p-10 text-center">
            <p className="text-neutral-500">No projects yet.</p>
            {canCreate && <p className="mt-1 text-sm text-neutral-400">Create your first project to start the delivery chain.</p>}
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {projects.map((p) => (
              <Link key={p.id} href={`/projects/${p.id}`} className="rounded-xl border border-neutral-200 bg-white p-5 hover:border-neutral-400">
                <div className="font-medium">{p.name}</div>
                {p.description && <p className="mt-1 line-clamp-2 text-sm text-neutral-500">{p.description}</p>}
                <div className="mt-3 flex flex-wrap gap-3 text-xs text-neutral-500">
                  <span>{formatBudget(p.budget, p.currency)}</span>
                  {p.startDate && <span>{isoToMmddyyyy(p.startDate)}{p.endDate ? ` → ${isoToMmddyyyy(p.endDate)}` : ""}</span>}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
