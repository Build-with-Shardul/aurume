"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveConnector, removeConnector } from "./actions";

type Field = { key: string; label: string; type: "text" | "password"; secret: boolean; placeholder?: string };
type Provider = { id: string; name: string; description: string; available: boolean; fields: Field[] };
type Connected = { provider: string; config: Record<string, string>; secretMask: string | null };

export default function ConnectorsClient({
  providers,
  connected,
}: {
  providers: Provider[];
  connected: Connected[];
}) {
  return (
    <div className="mt-8 space-y-4">
      {providers.map((p) => (
        <ConnectorCard key={p.id} provider={p} state={connected.find((c) => c.provider === p.id) ?? null} />
      ))}
    </div>
  );
}

function ConnectorCard({ provider, state }: { provider: Provider; state: Connected | null }) {
  const router = useRouter();
  const isConnected = !!state;
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>(() => ({ ...(state?.config ?? {}) }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const r = await saveConnector(provider.id, values);
    setBusy(false);
    if (r?.error) return setErr(r.error);
    setOpen(false);
    router.refresh();
  }

  async function disconnect() {
    if (!confirm(`Disconnect ${provider.name}?`)) return;
    setBusy(true);
    await removeConnector(provider.id);
    setBusy(false);
    setValues({});
    router.refresh();
  }

  const field = "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900";

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium">{provider.name}</span>
            {isConnected ? (
              <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">Connected</span>
            ) : provider.available ? (
              <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500">Not connected</span>
            ) : (
              <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-400">Coming soon</span>
            )}
          </div>
          <p className="mt-0.5 text-sm text-neutral-500">{provider.description}</p>
          {isConnected && state?.secretMask && (
            <p className="mt-1 text-xs text-neutral-400">
              Key {state.secretMask}
              {state.config?.fromEmail ? ` · from ${state.config.fromEmail}` : ""}
            </p>
          )}
        </div>
        {provider.available && (
          <div className="flex flex-none items-center gap-2">
            {isConnected && (
              <button onClick={disconnect} disabled={busy} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50">
                Disconnect
              </button>
            )}
            <button
              onClick={() => setOpen((o) => !o)}
              className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800"
            >
              {isConnected ? "Update" : "Connect"}
            </button>
          </div>
        )}
      </div>

      {open && provider.available && (
        <form onSubmit={save} className="mt-4 border-t border-neutral-100 pt-4">
          {err && <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
          {provider.fields.map((f) => (
            <div key={f.key} className="mb-3">
              <label className="mb-1 block text-sm font-medium text-neutral-700">{f.label}</label>
              <input
                type={f.type}
                value={values[f.key] ?? ""}
                placeholder={f.secret && isConnected ? "Leave blank to keep current key" : f.placeholder}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                className={field}
              />
            </div>
          ))}
          <div className="flex gap-2">
            <button disabled={busy} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50">
              {busy ? "Saving…" : "Save"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-4 py-2 text-sm text-neutral-500 hover:text-neutral-900">
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
