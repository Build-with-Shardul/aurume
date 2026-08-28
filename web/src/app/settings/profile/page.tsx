import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth-server";

export default async function ProfilePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const u = session.user;
  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-900">
      <div className="w-full px-6 py-10">
        <h1 className="text-2xl font-semibold">Profile</h1>
        <p className="mt-1 text-sm text-neutral-500">Your account details.</p>
        <div className="mt-6 grid max-w-xl gap-4 sm:grid-cols-2">
          <Field label="Name" value={u.name || "—"} />
          <Field label="Email" value={u.email} />
        </div>
      </div>
    </main>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-neutral-400">{label}</div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}
