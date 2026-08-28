import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { asc, desc, eq } from "drizzle-orm";
import { getActiveMembership, canCreateProject } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { project, playbook, epic, story, projectMember, user } from "@/lib/db/schema";
import { currentProvider, MODEL_OPTIONS, defaultModel } from "@/lib/ai/provider";
import EpicDetail, { type StoryView } from "./stories-client";

export default async function EpicPage({ params }: { params: Promise<{ id: string; epicId: string }> }) {
  const { id, epicId } = await params;
  const m = await getActiveMembership();
  if (!m) redirect("/login");

  const e = (await db.select().from(epic).where(eq(epic.id, epicId)).limit(1))[0];
  if (!e || e.projectId !== id || e.organizationId !== m.orgId) notFound();
  const p = (await db.select().from(project).where(eq(project.id, id)).limit(1))[0];
  if (!p) notFound();

  const pb = (await db.select({ version: playbook.version, status: playbook.status }).from(playbook).where(eq(playbook.projectId, id)).orderBy(desc(playbook.version)).limit(1))[0] ?? null;

  const members = (await db
    .select({ userId: projectMember.userId, name: user.name, email: user.email })
    .from(projectMember)
    .innerJoin(user, eq(user.id, projectMember.userId))
    .where(eq(projectMember.projectId, id))).map((mm) => ({ userId: mm.userId, name: mm.name || mm.email }));

  const projectStories = await db.select({ id: story.id, title: story.title }).from(story).where(eq(story.projectId, id));

  const rows = await db.select().from(story).where(eq(story.epicId, epicId)).orderBy(asc(story.createdAt));
  const stories: StoryView[] = rows.map((s) => ({
    id: s.id,
    title: s.title,
    userStory: s.userStory,
    acceptanceCriteria: (s.acceptanceCriteria as string[]) ?? [],
    priority: s.priority,
    points: s.points,
    status: s.status,
    citations: (s.citations as string[]) ?? [],
    sourceApproved: s.sourceApproved,
    sourceVersion: s.sourceVersion,
    assigneeId: s.assigneeId,
    dependsOn: (s.dependsOn as string[]) ?? [],
    startDate: s.startDate,
    endDate: s.endDate,
  }));

  const canWork = canCreateProject(m.role) || p.createdBy === m.userId;
  const provider = currentProvider();
  const modelInfo = { provider, options: MODEL_OPTIONS[provider], defaultModel: defaultModel(provider) };

  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-900">
      <div className="w-full px-6 py-10">
        <Link href={`/projects/${id}/epics`} className="text-sm text-neutral-500 hover:text-neutral-900">← Epics</Link>
        <div className="mt-6">
          <EpicDetail
            projectId={id}
            epic={{ id: e.id, name: e.name, scopeDetail: e.scopeDetail, jiraId: e.jiraId, jiraUrl: e.jiraUrl }}
            stories={stories}
            members={members}
            projectStories={projectStories}
            canWork={canWork}
            modelInfo={modelInfo}
            playbookApproved={pb?.status === "approved"}
            playbookLabel={pb ? `v${pb.version} · ${pb.status}` : null}
          />
        </div>
      </div>
    </main>
  );
}
