import { redirect } from "next/navigation";
import Link from "next/link";
import { count, desc, eq } from "drizzle-orm";
import { getInstanceRole } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { user, organization, member } from "@/lib/db/schema";
import SuperadminClient from "./superadmin-client";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-900">
      <div className="w-full px-6 py-10">{children}</div>
    </main>
  );
}

export default async function SuperadminPage() {
  const r = await getInstanceRole();
  if (!r) redirect("/login");
  if (r.role !== "admin") {
    return (
      <Shell>
        <h1 className="text-2xl font-semibold">Not authorized</h1>
        <p className="mt-2 text-sm text-neutral-500">This area is for instance Super Admins only.</p>
        <Link href="/" className="mt-4 inline-block text-sm text-neutral-500 hover:text-neutral-900">← Back</Link>
      </Shell>
    );
  }

  const orgsRaw = await db
    .select({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      createdAt: organization.createdAt,
      members: count(member.id),
    })
    .from(organization)
    .leftJoin(member, eq(member.organizationId, organization.id))
    .groupBy(organization.id)
    .orderBy(desc(organization.createdAt));

  const usersRaw = await db
    .select({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      banned: user.banned,
      createdAt: user.createdAt,
    })
    .from(user)
    .orderBy(user.createdAt);

  const orgs = orgsRaw.map((o) => ({
    id: o.id,
    name: o.name,
    slug: o.slug,
    members: Number(o.members),
    createdAt: o.createdAt ? new Date(o.createdAt).toISOString() : null,
  }));
  const users = usersRaw.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role ?? "user",
    banned: !!u.banned,
  }));

  return (
    <Shell>
      <Link href="/" className="text-sm text-neutral-500 hover:text-neutral-900">← Back</Link>
      <h1 className="mt-3 text-2xl font-semibold">Platform administration</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Every organization and every user across this Aurume instance.
      </p>
      <div className="mt-4 flex gap-6 text-sm text-neutral-500">
        <span><strong className="text-neutral-900">{orgs.length}</strong> organizations</span>
        <span><strong className="text-neutral-900">{users.length}</strong> users</span>
        <span><strong className="text-neutral-900">{users.filter((u) => u.role === "admin").length}</strong> super admins</span>
      </div>
      <SuperadminClient orgs={orgs} users={users} meId={r.session.user.id} />
    </Shell>
  );
}
