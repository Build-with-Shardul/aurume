"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function VerifyPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(30);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    // Read ?email= client-side (avoids the useSearchParams Suspense requirement).
    try {
      const e = new URLSearchParams(window.location.search).get("email");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (e) setEmail(e);
    } catch { /* ignore */ }
    inputs.current[0]?.focus();
  }, []);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secondsLeft]);

  const code = digits.join("");
  const complete = code.length === 6;

  function setDigit(i: number, v: string) {
    const clean = v.replace(/\D/g, "");
    if (!clean && v !== "") return;
    setErr("");
    setDigits((d) => {
      const next = [...d];
      if (clean.length > 1) {
        // pasted / multiple chars — spread across boxes
        clean.split("").slice(0, 6 - i).forEach((c, k) => (next[i + k] = c));
      } else {
        next[i] = clean;
      }
      return next;
    });
    if (clean) {
      const nextIdx = Math.min(i + (clean.length > 1 ? clean.length : 1), 5);
      inputs.current[nextIdx]?.focus();
    }
  }

  function onKey(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[i] && i > 0) inputs.current[i - 1]?.focus();
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!complete) return;
    setBusy(true);
    setErr("");
    // UI stub: any 6-digit code is accepted in dev. Real email-OTP wires in later.
    await new Promise((r) => setTimeout(r, 500));
    setBusy(false);
    router.push("/onboarding");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-4 py-10 text-neutral-900">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="text-2xl font-semibold tracking-tight">Aurume</div>
        </div>

        <div className="rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm">
          <h1 className="text-xl font-semibold">Verify your email</h1>
          <p className="mt-1 mb-6 text-sm text-neutral-500">
            We sent a 6-digit code to {email ? <span className="font-medium text-neutral-800">{email}</span> : "your email"}.
          </p>

          {err && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}

          <form onSubmit={verify}>
            <div className="mb-2 flex justify-between gap-2">
              {digits.map((d, i) => (
                <input
                  key={i}
                  ref={(el) => { inputs.current[i] = el; }}
                  value={d}
                  onChange={(e) => setDigit(i, e.target.value)}
                  onKeyDown={(e) => onKey(i, e)}
                  inputMode="numeric"
                  maxLength={i === 0 ? 6 : 1}
                  className="h-12 w-full rounded-lg border border-neutral-300 text-center text-lg font-semibold outline-none focus:border-neutral-900"
                />
              ))}
            </div>
            <p className="mb-6 text-xs text-neutral-400">Dev mode — enter any 6 digits to continue.</p>

            <button disabled={busy || !complete} className="w-full rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50">
              {busy ? "Verifying…" : "Verify"}
            </button>
          </form>

          <div className="mt-4 text-center text-sm text-neutral-500">
            {secondsLeft > 0 ? (
              <span>Resend code in {secondsLeft}s</span>
            ) : (
              <button onClick={() => { setSecondsLeft(30); setDigits(["", "", "", "", "", ""]); inputs.current[0]?.focus(); }} className="font-medium text-neutral-900 hover:underline">
                Resend code
              </button>
            )}
          </div>
        </div>

        <p className="mt-5 text-center text-sm text-neutral-500">
          Wrong email? <Link href="/signup" className="font-medium text-neutral-900 hover:underline">Go back</Link>
        </p>
      </div>
    </main>
  );
}
