"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { ASSIGNABLE_ROLES, DISCIPLINES, DISCIPLINE_LABEL } from "@/lib/permissions";
import { addCustomDiscipline } from "./actions";

type Member = { id: string; role: string; discipline?: string | null; user?: { email?: string; name?: string } };
type Invitation = { id: string; email: string; role?: string; discipline?: string | null; status: string };
type Org = { id: string; name: string; members?: Member[]; invitations?: Invitation[] };
type CustomDiscipline = { value: string; label: string };

export default function PeopleClient({ customDisciplines }: { customDisciplines: CustomDiscipline[] }) {
  const router = useRouter();
  const [org, setOrg] = useState<Org | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [email, setEmail] = useState("");
  const [discipline, setDiscipline] = useState<string>(DISCIPLINES[0].value);
  const [role, setRole] = useState<string>("contributor");
  const [inviting, setInviting] = useState(false);

  // add-custom-title UI
  const [addingTitle, setAddingTitle] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [titleErr, setTitleErr] = useState("");

  const allDisciplines: CustomDiscipline[] = [...DISCIPLINES, ...customDisciplines];
  const labelMap: Record<string, string> = {
    ...DISCIPLINE_LABEL,
    ...Object.fromEntries(customDisciplines.map((d) => [d.value, d.label])),
  };

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    const list = await authClient.organization.list();
    const first = list.data?.[0];
    if (first) await authClient.organization.setActive({ organizationId: first.id });
    const full = await authClient.organization.getFullOrganization();
    if (full.error) setErr(full.error.message || "Could not load the workspace");
    setOrg((full.data as Org) ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);
    setErr("");
    setMsg("");
    const r = await authClient.organization.inviteMember({ email, role, discipline } as never);
    setInviting(false);
    if (r.error) return setErr(r.error.message || "Invite failed");
    setMsg(`Invited ${email} — ${labelMap[discipline] ?? discipline}, ${role}. They'll get a link to set a password.`);
    setEmail("");
    await load();
  }

  async function submitTitle() {
    setTitleErr("");
    const r = await addCustomDiscipline(newTitle);
    if (r?.error) return setTitleErr(r.error);
    setAddingTitle(false);
    setNewTitle("");
    if (r?.value) setDiscipline(r.value);
    router.refresh();
  }

  const field = "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900";
  const pending = (org?.invitations ?? []).filter((i) => i.status === "pending");

  return (
    <div className="mt-8 space-y-8">
      <form onSubmit={invite} className="rounded-xl border border-neutral-200 bg-white p-6">
        <h2 className="font-medium">Add a person</h2>
        {err && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
        {msg && <p className="mt-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{msg}</p>}

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-12">
          <input
            type="email"
            required
            placeholder="teammate@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={`${field} sm:col-span-5`}
          />
          <select value={discipline} onChange={(e) => setDiscipline(e.target.value)} className={`${field} sm:col-span-4`} title="Discipline / job title">
            {allDisciplines.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
          <select value={role} onChange={(e) => setRole(e.target.value)} className={`${field} sm:col-span-3 capitalize`} title="Permission role">
            {ASSIGNABLE_ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>

        {/* Add a custom title */}
        {addingTitle ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              autoFocus
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="New job title (e.g. Delivery Lead)"
              className={`${field} sm:w-64`}
            />
            <button type="button" onClick={submitTitle} className="rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800">
              Add title
            </button>
            <button type="button" onClick={() => { setAddingTitle(false); setTitleErr(""); }} className="text-sm text-neutral-500 hover:text-neutral-900">
              Cancel
            </button>
            {titleErr && <span className="text-sm text-red-600">{titleErr}</span>}
          </div>
        ) : (
          <button type="button" onClick={() => setAddingTitle(true)} className="mt-3 text-sm text-neutral-500 hover:text-neutral-900">
            + Add a custom title
          </button>
        )}

        <div className="mt-3 flex items-center justify-between">
          <p className="text-xs text-neutral-400">Discipline is their job title; role governs what they can do.</p>
          <button disabled={inviting} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50">
            {inviting ? "Inviting…" : "Send invite"}
          </button>
        </div>
      </form>

      {loading ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : (
        <>
          <div className="rounded-xl border border-neutral-200 bg-white">
            <div className="border-b border-neutral-200 px-6 py-3 text-sm font-medium">Members ({org?.members?.length ?? 0})</div>
            <ul className="divide-y divide-neutral-100">
              {(org?.members ?? []).map((mem) => (
                <li key={mem.id} className="flex items-center justify-between px-6 py-3 text-sm">
                  <span>
                    <span className="font-medium">{mem.user?.name || mem.user?.email}</span>
                    {mem.user?.name && <span className="ml-2 text-neutral-400">{mem.user.email}</span>}
                  </span>
                  <span className="flex items-center gap-2">
                    {mem.discipline && <span className="text-xs text-neutral-500">{labelMap[mem.discipline] ?? mem.discipline}</span>}
                    <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium capitalize text-neutral-700">{mem.role}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {pending.length > 0 && (
            <div className="rounded-xl border border-neutral-200 bg-white">
              <div className="border-b border-neutral-200 px-6 py-3 text-sm font-medium">Pending invitations ({pending.length})</div>
              <ul className="divide-y divide-neutral-100">
                {pending.map((inv) => (
                  <li key={inv.id} className="flex items-center justify-between px-6 py-3 text-sm">
                    <span>{inv.email}</span>
                    <span className="flex items-center gap-2">
                      {inv.discipline && <span className="text-xs text-neutral-500">{labelMap[inv.discipline] ?? inv.discipline}</span>}
                      <span className="capitalize text-neutral-500">{inv.role}</span>
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">pending</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
