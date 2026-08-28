import { redirect } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { getActiveMembership, canCreateProject } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { member, user } from "@/lib/db/schema";
import { CURRENCIES } from "@/lib/currencies";
import NewProjectForm from "./new-project-form";

export default async function NewProjectPage() {
  const m = await getActiveMembership();
  if (!m) redirect("/login");
  if (!canCreateProject(m.role)) redirect("/projects");

  const orgMembers = m.orgId
    ? await db
        .select({ userId: member.userId, name: user.name, email: user.email })
        .from(member)
        .innerJoin(user, eq(user.id, member.userId))
        .where(eq(member.organizationId, m.orgId))
    : [];

  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-900">
      <div className="mx-auto max-w-2xl px-6 py-10">
        <Link href="/projects" className="text-sm text-neutral-500 hover:text-neutral-900">← Projects</Link>
        <h1 className="mt-3 text-2xl font-semibold">New project</h1>
        <NewProjectForm orgMembers={orgMembers} meId={m.userId} currencies={[...CURRENCIES]} />
      </div>
    </main>
  );
}
