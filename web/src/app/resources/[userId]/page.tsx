import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { getActiveMembership, canManageOrg } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { member, user, leave } from "@/lib/db/schema";
import { DISCIPLINE_LABEL } from "@/lib/permissions";
import { getResourceAllocation } from "@/lib/resource";
import ResourceClient from "./resource-client";

export default async function ResourcePage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const m = await getActiveMembership();
  if (!m) redirect("/login");
  if (!m.orgId || !canManageOrg(m.role)) redirect("/");

  const mem = (await db
    .select({ name: user.name, email: user.email, discipline: member.discipline })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(and(eq(member.organizationId, m.orgId), eq(member.userId, userId)))
    .limit(1))[0];
  if (!mem) notFound();

  const alloc = await getResourceAllocation(m.orgId, userId);
  const leaves = await db
    .select({ id: leave.id, start: leave.startDate, end: leave.endDate, type: leave.type, note: leave.note })
    .from(leave)
    .where(and(eq(leave.organizationId, m.orgId), eq(leave.userId, userId)))
    .orderBy(desc(leave.startDate));

  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-900">
      <div className="w-full px-6 py-10">
        <Link href="/resources" className="text-sm text-neutral-500 hover:text-neutral-900">← Resources</Link>
        <h1 className="mt-3 text-2xl font-semibold">{mem.name || mem.email}</h1>
        <p className="mt-1 text-sm text-neutral-500">{mem.discipline ? DISCIPLINE_LABEL[mem.discipline] ?? mem.discipline : "No role set"} · {mem.email}</p>
        <div className="mt-8">
          <ResourceClient userId={userId} alloc={alloc} leaves={leaves} />
        </div>
      </div>
    </main>
  );
}
