import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { getActiveMembership, canManageOrg } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { project, projectMember, member, user } from "@/lib/db/schema";
import { formatBudget } from "@/lib/currencies";
import ProjectMembersClient from "./project-members-client";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const m = await getActiveMembership();
  if (!m) redirect("/login");

  const p = (await db.select().from(project).where(eq(project.id, id)).limit(1))[0];
  if (!p || p.organizationId !== m.orgId) notFound();

  const members = await db
    .select({ userId: projectMember.userId, name: user.name, email: user.email })
    .from(projectMember)
    .innerJoin(user, eq(user.id, projectMember.userId))
    .where(eq(projectMember.projectId, id));

  const orgMembers = await db
    .select({ userId: member.userId, name: user.name, email: user.email })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(eq(member.organizationId, m.orgId));

  const onProject = new Set(members.map((x) => x.userId));
  const addable = orgMembers.filter((o) => !onProject.has(o.userId));
  const canManage = canManageOrg(m.role) || p.createdBy === m.userId;

  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-900">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link href="/" className="font-semibold">Aurume</Link>
          <span className="text-sm text-neutral-500">{m.role}</span>
        </div>
      </header>
      <div className="mx-auto max-w-3xl px-6 py-10">
        <Link href="/projects" className="text-sm text-neutral-500 hover:text-neutral-900">← Projects</Link>
        <h1 className="mt-3 text-2xl font-semibold">{p.name}</h1>
        {p.description && <p className="mt-2 text-neutral-600">{p.description}</p>}

        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field label="Budget" value={formatBudget(p.budget, p.currency)} />
          <Field label="Currency" value={p.currency} />
          <Field label="Expected start" value={p.startDate ?? "—"} />
          <Field label="Expected end" value={p.endDate ?? "—"} />
        </div>
        <p className="mt-4 text-xs text-neutral-400">Project ID: <span className="font-mono">{p.id}</span></p>

        <div className="mt-8">
          <ProjectMembersClient projectId={id} members={members} addable={addable} canManage={canManage} />
        </div>
      </div>
    </main>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-3">
      <div className="text-xs uppercase tracking-wide text-neutral-400">{label}</div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}
