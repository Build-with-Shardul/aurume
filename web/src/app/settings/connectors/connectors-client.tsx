"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveConnector, removeConnector } from "./actions";

type Field = { key: string; label: string; type: "text" | "password"; secret: boolean; placeholder?: string };
type Logo = { bg: string; fg: string; mark: string };
type Provider = { id: string; name: string; description: string; category: string; logo: Logo; available: boolean; fields: Field[] };
type Connected = { provider: string; config: Record<string, string>; secretMask: string | null };

function LogoTile({ logo, size = "md" }: { logo: Logo; size?: "md" | "lg" }) {
  const cls = size === "lg" ? "h-11 w-11 text-base" : "h-9 w-9 text-sm";
  return (
    <span className={`flex ${cls} shrink-0 items-center justify-center rounded-lg font-semibold`} style={{ backgroundColor: logo.bg, color: logo.fg }}>
      {logo.mark}
    </span>
  );
}

export default function ConnectorsClient({
  providers,
  connected,
  categories,
}: {
  providers: Provider[];
  connected: Connected[];
  categories: string[];
}) {
  const [active, setActive] = useState<Provider | null>(null);
  const stateFor = (id: string) => connected.find((c) => c.provider === id) ?? null;
  const cats = categories.filter((cat) => providers.some((p) => p.category === cat));

  return (
    <div className="mt-8 space-y-8">
      {cats.map((cat) => (
        <section key={cat}>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">{cat}</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {providers.filter((p) => p.category === cat).map((p) => (
              <Card key={p.id} provider={p} state={stateFor(p.id)} onOpen={() => setActive(p)} />
            ))}
          </div>
        </section>
      ))}
      {active && <ConnectModal provider={active} state={stateFor(active.id)} onClose={() => setActive(null)} />}
    </div>
  );
}

function Card({ provider, state, onOpen }: { provider: Provider; state: Connected | null; onOpen: () => void }) {
  const isConnected = !!state;
  return (
    <button
      onClick={provider.available ? onOpen : undefined}
      disabled={!provider.available}
      className="group flex flex-col rounded-xl border border-neutral-200 bg-white p-4 text-left transition hover:border-neutral-400 hover:shadow-sm disabled:cursor-default disabled:opacity-70 disabled:hover:border-neutral-200 disabled:hover:shadow-none"
    >
      <div className="flex items-start justify-between">
        <LogoTile logo={provider.logo} />
        {isConnected ? (
          <span className="flex items-center gap-1.5 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500" />Connected
          </span>
        ) : provider.available ? (
          <span className="text-xs text-neutral-400 group-hover:text-neutral-700">Connect →</span>
        ) : (
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-400">Soon</span>
        )}
      </div>
      <div className="mt-3 text-sm font-medium text-neutral-900">{provider.name}</div>
      <p className="mt-0.5 line-clamp-2 text-xs text-neutral-500">{provider.description}</p>
    </button>
  );
}

function ConnectModal({ provider, state, onClose }: { provider: Provider; state: Connected | null; onClose: () => void }) {
  const router = useRouter();
  const isConnected = !!state;
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
    onClose();
    router.refresh();
  }
  async function disconnect() {
    if (!confirm(`Disconnect ${provider.name}?`)) return;
    setBusy(true);
    await removeConnector(provider.id);
    setBusy(false);
    onClose();
    router.refresh();
  }
  const field = "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          <LogoTile logo={provider.logo} size="lg" />
          <div className="min-w-0">
            <div className="font-semibold">{provider.name}</div>
            {isConnected && <div className="flex items-center gap-1 text-xs font-medium text-green-700"><span className="h-1.5 w-1.5 rounded-full bg-green-500" />Connected</div>}
          </div>
          <button onClick={onClose} aria-label="Close" className="ml-auto rounded-lg p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700">✕</button>
        </div>
        <p className="mt-3 text-sm text-neutral-500">{provider.description}</p>

        <form onSubmit={save} className="mt-4 space-y-3">
          {err && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
          {provider.fields.map((f) => (
            <div key={f.key}>
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
          {isConnected && state?.secretMask && (
            <p className="text-xs text-neutral-400">Current key {state.secretMask}{state.config?.fromEmail ? ` · from ${state.config.fromEmail}` : ""}</p>
          )}
          <div className="flex items-center gap-2 pt-1">
            <button disabled={busy} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50">
              {busy ? "Saving…" : isConnected ? "Update" : "Connect"}
            </button>
            {isConnected && (
              <button type="button" onClick={disconnect} disabled={busy} className="rounded-lg border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-50 disabled:opacity-50">Disconnect</button>
            )}
            <button type="button" onClick={onClose} className="ml-auto rounded-lg px-3 py-2 text-sm text-neutral-500 hover:text-neutral-900">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}
