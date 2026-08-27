import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { getActiveMembership, canManageOrg } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { project, projectMember, member, user, connector } from "@/lib/db/schema";
import { isProjectStarted } from "@/lib/dates";
import ProjectMembersClient from "../project-members-client";
import ProjectSettingsForm from "./project-settings-form";
import ProjectChannelsForm from "./project-channels-form";

export default async function ProjectSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const m = await getActiveMembership();
  if (!m) redirect("/login");

  const p = (await db.select().from(project).where(eq(project.id, id)).limit(1))[0];
  if (!p || p.organizationId !== m.orgId) notFound();

  const members = await db
    .select({
      userId: projectMember.userId,
      name: user.name,
      email: user.email,
      rate: projectMember.rate,
      timezone: projectMember.timezone,
    })
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
  const isOrgManager = canManageOrg(m.role);
  const started = isProjectStarted(p.startDate);

  const connectors = await db
    .select({ provider: connector.provider })
    .from(connector)
    .where(eq(connector.organizationId, m.orgId));
  const connectedProviders = new Set(connectors.map((c) => c.provider));

  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-900">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="font-semibold">Aurume</Link>
          <span className="text-sm text-neutral-500">{m.role}</span>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-6 py-10">
        <Link href={`/projects/${id}`} className="text-sm text-neutral-500 hover:text-neutral-900">← {p.name}</Link>
        <h1 className="mt-3 text-2xl font-semibold">Project settings</h1>
        <p className="mt-1 text-sm text-neutral-500">{p.name}</p>

        <div className="mt-8 space-y-8">
          <ProjectSettingsForm
            projectId={id}
            currency={p.currency}
            budget={p.budget}
            startDate={p.startDate}
            endDate={p.endDate}
            started={started}
            canManage={canManage}
          />
          <ProjectChannelsForm
            projectId={id}
            slackChannel={p.slackChannel}
            teamsChannel={p.teamsChannel}
            slackConnected={connectedProviders.has("slack")}
            teamsConnected={connectedProviders.has("teams")}
            canManage={canManage}
            canManageOrg={isOrgManager}
          />
          <ProjectMembersClient projectId={id} members={members} addable={addable} canManage={canManage} currency={p.currency} />
        </div>
      </div>
    </main>
  );
}
