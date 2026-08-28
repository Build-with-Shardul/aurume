import { redirect } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { getSession, hasUsers } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { member, organization } from "@/lib/db/schema";
import StopImpersonatingButton from "./stop-impersonating-button";

export default async function Home() {
  if (!(await hasUsers())) redirect("/setup");
  const session = await getSession();
  if (!session) redirect("/login");

  const memberships = await db
    .select({ orgId: organization.id, orgName: organization.name, role: member.role })
    .from(member)
    .innerJoin(organization, eq(member.organizationId, organization.id))
    .where(eq(member.userId, session.user.id));

  const m = memberships[0];
  const canManage = m ? m.role === "owner" || m.role === "admin" : false;
  const impersonatedBy = (session.session as { impersonatedBy?: string | null }).impersonatedBy;

  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-900">
      {impersonatedBy && (
        <div className="bg-amber-100 px-6 py-2 text-center text-sm text-amber-900">
          You&apos;re impersonating <strong>{session.user.email}</strong>. <StopImpersonatingButton />
        </div>
      )}

      <div className="w-full px-6 py-10">
        <h1 className="text-2xl font-semibold">
          Welcome{session.user.name ? `, ${session.user.name}` : ""}.
        </h1>

        {m ? (
          <div className="mt-6 rounded-xl border border-neutral-200 bg-white p-6">
            <div className="text-xs uppercase tracking-wide text-neutral-400">Workspace</div>
            <div className="mt-1 text-lg font-medium">{m.orgName}</div>
            <div className="mt-3 text-sm text-neutral-600">
              Your role:{" "}
              <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium capitalize text-neutral-800">
                {m.role}
              </span>
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href="/projects"
                className="inline-block rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
              >
                Projects →
              </Link>
              <Link
                href="/knowledge"
                className="inline-block rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50"
              >
                Organization knowledge
              </Link>
              {canManage && (
                <Link
                  href="/admin/people"
                  className="inline-block rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50"
                >
                  Manage people
                </Link>
              )}
              {canManage && (
                <Link
                  href="/settings/connectors"
                  className="inline-block rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50"
                >
                  Connectors
                </Link>
              )}
              {canManage && (
                <Link
                  href="/resources"
                  className="inline-block rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50"
                >
                  Resources
                </Link>
              )}
              {canManage && (
                <Link
                  href="/usage"
                  className="inline-block rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50"
                >
                  AI usage
                </Link>
              )}
            </div>
          </div>
        ) : (
          <p className="mt-4 text-neutral-500">You&apos;re not part of a workspace yet.</p>
        )}
      </div>
    </main>
  );
}
