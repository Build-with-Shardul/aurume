"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient, signUp } from "@/lib/auth-client";

function slugify(s: string) {
  return (
    s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40) || "workspace"
  );
}

export default function SetupForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [org, setOrg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");

    const su = await signUp.email({ name, email, password });
    if (su.error) {
      setBusy(false);
      return setErr(su.error.message || "Could not create the account");
    }

    const co = await authClient.organization.create({ name: org, slug: slugify(org) });
    if (co.error) {
      setBusy(false);
      return setErr(co.error.message || "Account created, but the workspace failed. Try /admin/people.");
    }
    const orgId = co.data?.id;
    if (orgId) await authClient.organization.setActive({ organizationId: orgId });

    router.push("/admin/people");
    router.refresh();
  }

  const field = "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900";
  const label = "mb-1 block text-sm font-medium text-neutral-700";

  return (
    <form onSubmit={submit} className="rounded-xl border border-neutral-200 bg-white p-8 shadow-sm">
      {err && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}

      <label className={label}>Your name</label>
      <input required value={name} onChange={(e) => setName(e.target.value)} className={`${field} mb-4`} />

      <label className={label}>Email</label>
      <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={`${field} mb-4`} />

      <label className={label}>Password</label>
      <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className={`${field} mb-4`} />
      <p className="-mt-3 mb-4 text-xs text-neutral-400">At least 8 characters.</p>

      <label className={label}>Workspace name</label>
      <input required value={org} onChange={(e) => setOrg(e.target.value)} placeholder="Acme Delivery" className={`${field} mb-6`} />

      <button disabled={busy} className="w-full rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50">
        {busy ? "Creating…" : "Create workspace"}
      </button>
    </form>
  );
}
