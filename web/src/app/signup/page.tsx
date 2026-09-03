"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signUp } from "@/lib/auth-client";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agree, setAgree] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!agree) return setErr("Please accept the Terms & Conditions to continue.");
    setBusy(true);
    setErr("");
    const { error } = await signUp.email({ name, email, password });
    setBusy(false);
    if (error) return setErr(error.message || "Could not create your account");
    // Account created. Next: verify the email (OTP is a UI stub for now).
    router.push(`/verify?email=${encodeURIComponent(email)}`);
  }

  const field = "w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-sm outline-none focus:border-neutral-900";
  const label = "mb-1 block text-sm font-medium text-neutral-700";

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-4 py-10 text-neutral-900">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="text-2xl font-semibold tracking-tight">Aurume</div>
          <p className="mt-1 text-sm text-neutral-500">Idea to delivery, with lineage.</p>
        </div>

        <div className="rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm">
          <h1 className="text-xl font-semibold">Create your account</h1>
          <p className="mt-1 mb-6 text-sm text-neutral-500">Start your workspace in a minute.</p>

          {err && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}

          <button
            type="button"
            disabled
            title="Coming soon"
            className="mb-4 flex w-full items-center justify-center gap-2 rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-500 opacity-70"
          >
            <span className="text-base font-bold text-[#4285F4]">G</span>
            Continue with Google
            <span className="ml-1 rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-normal text-neutral-400">Soon</span>
          </button>

          <div className="my-4 flex items-center gap-3 text-xs text-neutral-400">
            <span className="h-px flex-1 bg-neutral-200" />or continue with email<span className="h-px flex-1 bg-neutral-200" />
          </div>

          <form onSubmit={submit}>
            <label className={label}>Full name</label>
            <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" className={`${field} mb-4`} />

            <label className={label}>Work email</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@company.com" className={`${field} mb-4`} />

            <label className={label}>Password</label>
            <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" className={field} />
            <p className="mb-4 mt-1 text-xs text-neutral-400">You can add a magic link later.</p>

            <label className="mb-6 flex items-start gap-2 text-sm text-neutral-600">
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-neutral-300" />
              <span>I agree to the <a href="#" className="text-neutral-900 underline">Terms &amp; Conditions</a> and <a href="#" className="text-neutral-900 underline">Privacy Policy</a>.</span>
            </label>

            <button disabled={busy} className="w-full rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50">
              {busy ? "Creating account…" : "Create account"}
            </button>
          </form>
        </div>

        <p className="mt-5 text-center text-sm text-neutral-500">
          Already have an account? <Link href="/login" className="font-medium text-neutral-900 hover:underline">Sign in</Link>
        </p>
      </div>
    </main>
  );
}
