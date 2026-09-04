"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient, useSession } from "@/lib/auth-client";
import { DISCIPLINES } from "@/lib/permissions";
import { saveOnboarding } from "./actions";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40) || "workspace";
}

const ROLES = [
  { key: "product_manager", label: "Product Manager", icon: "🧭" },
  { key: "engineering_manager", label: "Engineering Manager", icon: "🛠️" },
  { key: "project_manager", label: "Project Manager", icon: "📋" },
  { key: "ux_designer", label: "Designer", icon: "🎨" },
  { key: "developer", label: "Developer", icon: "💻" },
  { key: "scrum_master", label: "Scrum Master", icon: "🏃" },
  { key: "business_analyst", label: "Business Analyst", icon: "📊" },
  { key: "other", label: "Something else", icon: "✨" },
];

const INTENTS = [
  { key: "roadmap", label: "Plan & track a product roadmap", icon: "🗺️" },
  { key: "sprints", label: "Manage engineering sprints", icon: "🔁" },
  { key: "coordinate", label: "Coordinate cross-functional projects", icon: "🤝" },
  { key: "replace", label: "Replace our current tool", icon: "🔀" },
  { key: "exploring", label: "Just exploring", icon: "👀" },
];

const SIZES = [
  { key: "1", label: "Just myself" },
  { key: "2-10", label: "2–10" },
  { key: "11-50", label: "11–50" },
  { key: "51-200", label: "51–200" },
  { key: "200+", label: "200+" },
];

const STEPS = ["Your role", "Your goal", "Workspace", "Team size"];

export default function OnboardingPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();

  const [step, setStep] = useState(0);
  const [role, setRole] = useState("");
  const [intent, setIntent] = useState("");
  const [workspace, setWorkspace] = useState("");
  const [size, setSize] = useState("");
  const [inviteEmails, setInviteEmails] = useState<string[]>(["", ""]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // Not signed up yet → back to signup.
  useEffect(() => {
    if (!isPending && !session?.user) router.replace("/signup");
  }, [isPending, session, router]);

  // Suggest a workspace name from the user's first name, once.
  useEffect(() => {
    if (session?.user?.name && !workspace) {
      const first = session.user.name.trim().split(" ")[0];
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (first) setWorkspace(`${first}'s Workspace`);
    }
  }, [session, workspace]);

  const slug = useMemo(() => slugify(workspace), [workspace]);

  const solo = size === "1";
  const validInvites = inviteEmails.map((e) => e.trim()).filter((e) => EMAIL_RE.test(e));
  const hasInvites = !solo && validInvites.length > 0;

  const canNext = [!!role, !!intent, workspace.trim().length > 1, !!size][step];

  async function finish() {
    setBusy(true);
    setErr("");
    const co = await authClient.organization.create({ name: workspace.trim(), slug });
    if (co.error) {
      setBusy(false);
      return setErr(co.error.message || "Could not create the workspace. Try a different name.");
    }
    const orgId = co.data?.id;
    if (orgId) await authClient.organization.setActive({ organizationId: orgId });
    // Persist onboarding answers: role/intent → user, team size → workspace.
    await saveOnboarding({ role, intent, teamSize: size, organizationId: orgId });
    // Optional invites → real pending invitations (delivery activates once Resend connects).
    if (hasInvites) {
      for (const email of validInvites) {
        await authClient.organization
          .inviteMember({ email, role: "contributor", discipline: DISCIPLINES[0].value } as never)
          .catch(() => {}); // best-effort; a bad address shouldn't block onboarding
      }
    }
    router.push("/projects");
    router.refresh();
  }

  function next() {
    if (!canNext) return;
    if (step < STEPS.length - 1) setStep((s) => s + 1);
    else finish();
  }

  if (isPending || !session?.user) {
    return <main className="flex min-h-screen items-center justify-center bg-neutral-50 text-sm text-neutral-400">Loading…</main>;
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-4 py-10 text-neutral-900">
      <div className="w-full max-w-lg">
        <div className="mb-6 text-center text-2xl font-semibold tracking-tight">Aurume</div>

        <div className="rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm">
          {/* progress */}
          <div className="mb-6 flex items-center gap-2">
            {STEPS.map((s, i) => (
              <div key={s} className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-neutral-900" : "bg-neutral-200"}`} />
            ))}
          </div>
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-400">Step {step + 1} of {STEPS.length}</div>

          {err && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}

          {step === 0 && (
            <>
              <h1 className="text-xl font-semibold">What best describes your role?</h1>
              <p className="mt-1 mb-5 text-sm text-neutral-500">We&apos;ll tailor Aurume to how you work.</p>
              <div className="grid grid-cols-2 gap-2.5">
                {ROLES.map((r) => (
                  <OptionCard key={r.key} icon={r.icon} label={r.label} selected={role === r.key} onClick={() => setRole(r.key)} />
                ))}
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <h1 className="text-xl font-semibold">What brings you to Aurume?</h1>
              <p className="mt-1 mb-5 text-sm text-neutral-500">Pick the closest fit — you can do it all later.</p>
              <div className="space-y-2.5">
                {INTENTS.map((it) => (
                  <OptionRow key={it.key} icon={it.icon} label={it.label} selected={intent === it.key} onClick={() => setIntent(it.key)} />
                ))}
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h1 className="text-xl font-semibold">Name your workspace</h1>
              <p className="mt-1 mb-5 text-sm text-neutral-500">This is where your team&apos;s work lives.</p>
              <label className="mb-1 block text-sm font-medium text-neutral-700">Workspace name</label>
              <input
                autoFocus
                value={workspace}
                onChange={(e) => setWorkspace(e.target.value)}
                placeholder="Acme Inc."
                className="mb-3 w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-sm outline-none focus:border-neutral-900"
              />
              <div className="rounded-lg bg-neutral-50 px-3 py-2.5 text-sm">
                <span className="text-neutral-400">Your URL: </span>
                <span className="font-medium text-neutral-700">app.aurume.dev/</span>
                <span className="font-medium text-neutral-900">{slug}</span>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <h1 className="text-xl font-semibold">How many people will use this workspace?</h1>
              <p className="mt-1 mb-5 text-sm text-neutral-500">Helps us set sensible defaults.</p>
              <div className="grid grid-cols-2 gap-2.5">
                {SIZES.map((s) => (
                  <OptionCard key={s.key} label={s.label} selected={size === s.key} onClick={() => setSize(s.key)} />
                ))}
              </div>

              {size && !solo && (
                <div className="mt-6 rounded-xl border border-neutral-200 p-4">
                  <div className="text-sm font-medium text-neutral-800">
                    Invite your team <span className="font-normal text-neutral-400">· optional</span>
                  </div>
                  <p className="mt-0.5 mb-3 text-xs text-neutral-500">
                    Add teammates by email — they&apos;ll join as members, and you can change roles later.
                  </p>
                  <div className="space-y-2">
                    {inviteEmails.map((em, i) => (
                      <input
                        key={i}
                        type="email"
                        value={em}
                        onChange={(e) => setInviteEmails((arr) => arr.map((x, k) => (k === i ? e.target.value : x)))}
                        placeholder="teammate@company.com"
                        className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
                      />
                    ))}
                  </div>
                  <button type="button" onClick={() => setInviteEmails((arr) => [...arr, ""])} className="mt-2 text-xs font-medium text-neutral-500 hover:text-neutral-900">
                    + Add another
                  </button>
                  <p className="mt-3 text-xs text-neutral-400">
                    Invites send once this workspace connects an email provider (Resend). You can also invite people anytime from Manage People.
                  </p>
                </div>
              )}
            </>
          )}

          <div className="mt-7 flex items-center gap-3">
            {step > 0 && (
              <button onClick={() => setStep((s) => s - 1)} disabled={busy} className="rounded-lg px-4 py-2.5 text-sm font-medium text-neutral-500 hover:text-neutral-900 disabled:opacity-50">
                Back
              </button>
            )}
            <button onClick={next} disabled={!canNext || busy} className="ml-auto rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-40">
              {step < STEPS.length - 1 ? "Continue" : busy ? "Creating workspace…" : hasInvites ? "Send invites & finish" : "Create workspace"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

function OptionCard({ icon, label, selected, onClick }: { icon?: string; label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2.5 rounded-xl border px-3.5 py-3 text-left text-sm transition ${
        selected ? "border-neutral-900 bg-neutral-900/[0.03] ring-1 ring-neutral-900" : "border-neutral-200 hover:border-neutral-400"
      }`}
    >
      {icon && <span className="text-base leading-none">{icon}</span>}
      <span className={`font-medium ${selected ? "text-neutral-900" : "text-neutral-700"}`}>{label}</span>
      {selected && <span className="ml-auto text-neutral-900">✓</span>}
    </button>
  );
}

function OptionRow({ icon, label, selected, onClick }: { icon: string; label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition ${
        selected ? "border-neutral-900 bg-neutral-900/[0.03] ring-1 ring-neutral-900" : "border-neutral-200 hover:border-neutral-400"
      }`}
    >
      <span className="text-base leading-none">{icon}</span>
      <span className={`font-medium ${selected ? "text-neutral-900" : "text-neutral-700"}`}>{label}</span>
      {selected && <span className="ml-auto text-neutral-900">✓</span>}
    </button>
  );
}
