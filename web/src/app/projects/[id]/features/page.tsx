import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getActiveMembership, canCreateProject, canManageOrg } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { project, feature, playbook, member, user } from "@/lib/db/schema";
import PlaybookWorkspace, { type PlaybookView } from "./workspace-client";

export default async function FeaturesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const m = await getActiveMembership();
  if (!m) redirect("/login");

  const p = (await db.select().from(project).where(eq(project.id, id)).limit(1))[0];
  if (!p || p.organizationId !== m.orgId) notFound();

  const features = await db
    .select({ id: feature.id, title: feature.title, brief: feature.brief })
    .from(feature)
    .where(eq(feature.projectId, id))
    .orderBy(feature.createdAt);

  const pb = (await db.select().from(playbook).where(eq(playbook.projectId, id)).orderBy(desc(playbook.version)).limit(1))[0] ?? null;

  const members = await db
    .select({ userId: member.userId, name: user.name, email: user.email })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(eq(member.organizationId, m.orgId!));

  const canWork = canCreateProject(m.role) || p.createdBy === m.userId;
  const isOrgAdmin = canManageOrg(m.role);

  const playbookView: PlaybookView | null = pb
    ? {
        id: pb.id,
        version: pb.version,
        status: pb.status,
        stale: pb.stale,
        content: pb.content as PlaybookView["content"],
        groundedness: pb.groundedness,
        provider: pb.provider,
        model: pb.model,
        edited: pb.edited,
        approverId: pb.approverId,
        approverName: pb.approverId ? members.find((x) => x.userId === pb.approverId)?.name ?? members.find((x) => x.userId === pb.approverId)?.email ?? null : null,
        canApprove: (pb.approverId ? pb.approverId === m.userId : canWork) || isOrgAdmin,
      }
    : null;

  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-900">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/" className="font-semibold">Aurume</Link>
          <span className="text-sm text-neutral-500">{m.role}</span>
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-6 py-10">
        <Link href={`/projects/${id}`} className="text-sm text-neutral-500 hover:text-neutral-900">← {p.name}</Link>
        <h1 className="mt-3 text-2xl font-semibold">Features & product playbook</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Add the features this product includes on the left. Aurume synthesizes them — grounded in this project&apos;s and
          your organization&apos;s knowledge — into one product playbook on the right. Change a feature and the playbook goes
          out of date until you update it.
        </p>
        <div className="mt-8">
          <PlaybookWorkspace
            projectId={id}
            features={features}
            playbook={playbookView}
            members={members}
            canWork={canWork}
          />
        </div>
      </div>
    </main>
  );
}
