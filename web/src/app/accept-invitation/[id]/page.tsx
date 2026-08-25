import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { invitation, organization } from "@/lib/db/schema";
import AcceptForm from "./accept-form";

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-4 text-neutral-900">
      <div className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-neutral-500">{body}</p>
      </div>
    </main>
  );
}

export default async function AcceptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const rows = await db
    .select({
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      orgName: organization.name,
    })
    .from(invitation)
    .innerJoin(organization, eq(invitation.organizationId, organization.id))
    .where(eq(invitation.id, id))
    .limit(1);

  const inv = rows[0];
  if (!inv) return <Notice title="Invitation not found" body="This invite link isn't valid." />;
  if (inv.status !== "pending")
    return <Notice title="Already used" body="This invitation has already been accepted or is no longer active." />;
  if (inv.expiresAt && new Date(inv.expiresAt) < new Date())
    return <Notice title="Invitation expired" body="Ask your admin to send a new invite." />;

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-4 text-neutral-900">
      <div className="w-full max-w-sm">
        <h1 className="text-xl font-semibold">Join {inv.orgName}</h1>
        <p className="mt-1 mb-6 text-sm text-neutral-500">
          You&apos;ve been invited as <span className="font-medium capitalize">{inv.role ?? "member"}</span>. Set a
          password to accept.
        </p>
        <AcceptForm invitationId={id} email={inv.email} role={inv.role ?? "member"} />
      </div>
    </main>
  );
}
