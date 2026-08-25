"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient, signUp } from "@/lib/auth-client";

export default function AcceptForm({
  invitationId,
  email,
  role,
}: {
  invitationId: string;
  email: string;
  role: string;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");

    // New invitee: create their account (they're signed in on success).
    const su = await signUp.email({ name, email, password });
    if (su.error) {
      setBusy(false);
      return setErr(
        su.error.message?.toLowerCase().includes("exist")
          ? "You already have an account — please sign in, then open this link again to accept."
          : su.error.message || "Could not create the account",
      );
    }

    const acc = await authClient.organization.acceptInvitation({ invitationId });
    if (acc.error) {
      setBusy(false);
      return setErr(acc.error.message || "Could not accept the invitation");
    }

    router.push("/");
    router.refresh();
  }

  const field = "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900";
  const label = "mb-1 block text-sm font-medium text-neutral-700";

  return (
    <form onSubmit={submit} className="rounded-xl border border-neutral-200 bg-white p-8 shadow-sm">
      {err && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}

      <label className={label}>Email</label>
      <input value={email} disabled className={`${field} mb-4 bg-neutral-50 text-neutral-500`} />

      <label className={label}>Your name</label>
      <input required value={name} onChange={(e) => setName(e.target.value)} className={`${field} mb-4`} />

      <label className={label}>Password</label>
      <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className={`${field} mb-6`} />

      <button disabled={busy} className="w-full rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50">
        {busy ? "Joining…" : "Accept & join"}
      </button>
    </form>
  );
}
