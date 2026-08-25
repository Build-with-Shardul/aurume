"use client";

import { useCallback, useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { ASSIGNABLE_ROLES } from "@/lib/permissions";

type Member = { id: string; role: string; user?: { email?: string; name?: string } };
type Invitation = { id: string; email: string; role?: string; status: string };
type Org = { id: string; name: string; members?: Member[]; invitations?: Invitation[] };

export default function PeopleClient() {
  const [org, setOrg] = useState<Org | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string>("contributor");
  const [inviting, setInviting] = useState(false);

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
    const r = await authClient.organization.inviteMember({ email, role });
    setInviting(false);
    if (r.error) return setErr(r.error.message || "Invite failed");
    setMsg(`Invited ${email} as ${role}. They'll receive a link to set a password.`);
    setEmail("");
    await load();
  }

  const field =
    "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900";

  const pending = (org?.invitations ?? []).filter((i) => i.status === "pending");

  return (
    <div className="mt-8 space-y-8">
      {/* Invite */}
      <form onSubmit={invite} className="rounded-xl border border-neutral-200 bg-white p-6">
        <h2 className="font-medium">Add a person</h2>
        {err && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
        {msg && <p className="mt-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{msg}</p>}
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <input
            type="email"
            required
            placeholder="teammate@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={`${field} sm:flex-1`}
          />
          <select value={role} onChange={(e) => setRole(e.target.value)} className={`${field} sm:w-56 capitalize`}>
            {ASSIGNABLE_ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <button
            disabled={inviting}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
          >
            {inviting ? "Inviting…" : "Send invite"}
          </button>
        </div>
      </form>

      {loading ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : (
        <>
          {/* Members */}
          <div className="rounded-xl border border-neutral-200 bg-white">
            <div className="border-b border-neutral-200 px-6 py-3 text-sm font-medium">
              Members ({org?.members?.length ?? 0})
            </div>
            <ul className="divide-y divide-neutral-100">
              {(org?.members ?? []).map((mem) => (
                <li key={mem.id} className="flex items-center justify-between px-6 py-3 text-sm">
                  <span>
                    <span className="font-medium">{mem.user?.name || mem.user?.email}</span>
                    {mem.user?.name && <span className="ml-2 text-neutral-400">{mem.user.email}</span>}
                  </span>
                  <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium capitalize text-neutral-700">
                    {mem.role}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Pending invitations */}
          {pending.length > 0 && (
            <div className="rounded-xl border border-neutral-200 bg-white">
              <div className="border-b border-neutral-200 px-6 py-3 text-sm font-medium">
                Pending invitations ({pending.length})
              </div>
              <ul className="divide-y divide-neutral-100">
                {pending.map((inv) => (
                  <li key={inv.id} className="flex items-center justify-between px-6 py-3 text-sm">
                    <span>{inv.email}</span>
                    <span className="flex items-center gap-3">
                      <span className="capitalize text-neutral-500">{inv.role}</span>
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                        pending
                      </span>
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
