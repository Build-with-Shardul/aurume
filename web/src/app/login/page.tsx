"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "@/lib/auth-client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const { error } = await signIn.email({ email, password });
    setBusy(false);
    if (error) return setErr(error.message || "Sign in failed");
    router.push("/");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-4 text-neutral-900">
      <form onSubmit={submit} className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold">Sign in to Aurume</h1>
        <p className="mt-1 mb-6 text-sm text-neutral-500">Welcome back.</p>

        {err && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}

        <label className="mb-1 block text-sm font-medium text-neutral-700">Email</label>
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
          className="mb-4 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900" />

        <label className="mb-1 block text-sm font-medium text-neutral-700">Password</label>
        <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
          className="mb-6 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900" />

        <button disabled={busy}
          className="w-full rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50">
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
