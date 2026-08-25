import { redirect } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { getSession, getActiveMembership } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { discipline } from "@/lib/db/schema";
import PeopleClient from "./people-client";

export default async function PeoplePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const m = await getActiveMembership();

  const custom = m?.orgId
    ? await db
        .select({ value: discipline.value, label: discipline.label })
        .from(discipline)
        .where(eq(discipline.organizationId, m.orgId))
    : [];

  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-900">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <Link href="/" className="font-semibold">
            Aurume
          </Link>
          <span className="text-sm text-neutral-500">{session.user.email}</span>
        </div>
      </header>
      <div className="mx-auto max-w-4xl px-6 py-10">
        <Link href="/" className="text-sm text-neutral-500 hover:text-neutral-900">
          ← Back
        </Link>
        <h1 className="mt-3 text-2xl font-semibold">People</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Invite your delivery team and assign each person a role. They&apos;ll get an email to set a password.
        </p>
        <PeopleClient customDisciplines={custom} />
      </div>
    </main>
  );
}
