"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { setInstanceAdmin, setBanned, deleteOrganization, rewrapConnectorSecrets } from "./actions";

type Org = { id: string; name: string; slug: string; members: number; createdAt: string | null };
type User = { id: string; email: string; name: string; role: string; banned: boolean };

export default function SuperadminClient({ orgs, users, meId }: { orgs: Org[]; users: User[]; meId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string>("");
  const [err, setErr] = useState("");
  const [rewrapMsg, setRewrapMsg] = useState("");

  async function rewrap() {
    setBusy("rewrap");
    setErr("");
    setRewrapMsg("");
    try {
      const r = await rewrapConnectorSecrets();
      if (r && "error" in r && r.error) setErr(r.error);
      else if (r && "ok" in r) setRewrapMsg(`Re-wrapped ${r.rewrapped} of ${r.total} connector secret${r.total === 1 ? "" : "s"} under the current key.`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Re-wrap failed");
    }
    setBusy("");
  }

  async function run(id: string, fn: () => Promise<{ error?: string; ok?: boolean } | void>) {
    setBusy(id);
    setErr("");
    try {
      const r = await fn();
      if (r && "error" in r && r.error) setErr(r.error);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Action failed");
    }
    setBusy("");
    router.refresh();
  }

  async function impersonate(userId: string) {
    setBusy(userId);
    setErr("");
    const r = await authClient.admin.impersonateUser({ userId });
    setBusy("");
    if (r.error) return setErr(r.error.message || "Could not impersonate");
    router.push("/");
    router.refresh();
  }

  const btn = "rounded-md border border-neutral-300 px-2.5 py-1 text-xs hover:bg-neutral-50 disabled:opacity-50";

  return (
    <div className="mt-8 space-y-8">
      {err && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}

      {/* Security / key rotation */}
      <div className="rounded-xl border border-neutral-200 bg-white px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium">Connector encryption</div>
            <p className="mt-0.5 text-xs text-neutral-500">
              After rotating <span className="font-mono">AURUME_ENCRYPTION_KEY</span> (keep the old value in{" "}
              <span className="font-mono">AURUME_ENCRYPTION_KEY_RETIRED</span>), re-wrap secrets under the new key.
            </p>
          </div>
          <button onClick={rewrap} disabled={busy === "rewrap"} className={btn}>
            {busy === "rewrap" ? "Re-wrapping…" : "Re-wrap connector secrets"}
          </button>
        </div>
        {rewrapMsg && <p className="mt-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">{rewrapMsg}</p>}
      </div>

      {/* Users */}
      <div className="rounded-xl border border-neutral-200 bg-white">
        <div className="border-b border-neutral-200 px-6 py-3 text-sm font-medium">Users ({users.length})</div>
        <ul className="divide-y divide-neutral-100">
          {users.map((u) => {
            const isMe = u.id === meId;
            const isAdmin = u.role === "admin";
            return (
              <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 px-6 py-3 text-sm">
                <span className="min-w-0">
                  <span className="font-medium">{u.name || u.email}</span>
                  {u.name && <span className="ml-2 text-neutral-400">{u.email}</span>}
                  {isMe && <span className="ml-2 text-xs text-neutral-400">(you)</span>}
                  {isAdmin && <span className="ml-2 rounded-full bg-neutral-900 px-2 py-0.5 text-xs font-medium text-white">Super Admin</span>}
                  {u.banned && <span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">Banned</span>}
                </span>
                <span className="flex flex-none flex-wrap gap-2">
                  <button className={btn} disabled={busy === u.id} onClick={() => run(u.id, () => setInstanceAdmin(u.id, !isAdmin))}>
                    {isAdmin ? "Revoke admin" : "Make admin"}
                  </button>
                  {!isMe && (
                    <>
                      <button className={btn} disabled={busy === u.id} onClick={() => run(u.id, () => setBanned(u.id, !u.banned))}>
                        {u.banned ? "Unban" : "Ban"}
                      </button>
                      <button className={btn} disabled={busy === u.id} onClick={() => impersonate(u.id)}>
                        Impersonate
                      </button>
                    </>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Organizations */}
      <div className="rounded-xl border border-neutral-200 bg-white">
        <div className="border-b border-neutral-200 px-6 py-3 text-sm font-medium">Organizations ({orgs.length})</div>
        <ul className="divide-y divide-neutral-100">
          {orgs.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 px-6 py-3 text-sm">
              <span>
                <span className="font-medium">{o.name}</span>
                <span className="ml-2 text-neutral-400">/{o.slug}</span>
                <span className="ml-3 text-xs text-neutral-500">{o.members} member{o.members === 1 ? "" : "s"}</span>
              </span>
              <button
                className="rounded-md border border-red-200 px-2.5 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"
                disabled={busy === o.id}
                onClick={() => {
                  if (confirm(`Delete "${o.name}" and all its data? This cannot be undone.`)) run(o.id, () => deleteOrganization(o.id));
                }}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
