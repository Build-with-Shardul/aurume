import { redirect } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { getActiveMembership, canManageOrg } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { connector } from "@/lib/db/schema";
import { CONNECTOR_PROVIDERS } from "@/lib/connectors";
import { decryptSecret, maskSecret } from "@/lib/crypto";
import ConnectorsClient from "./connectors-client";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-900">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="font-semibold">
            Aurume
          </Link>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-6 py-10">{children}</div>
    </main>
  );
}

export default async function ConnectorsPage() {
  const m = await getActiveMembership();
  if (!m) redirect("/login");

  if (!canManageOrg(m.role)) {
    return (
      <Shell>
        <Link href="/" className="text-sm text-neutral-500 hover:text-neutral-900">
          ← Back
        </Link>
        <h1 className="mt-3 text-2xl font-semibold">Connectors</h1>
        <p className="mt-2 text-sm text-neutral-500">Only owners and admins can manage connectors.</p>
      </Shell>
    );
  }

  const rows = m.orgId
    ? await db.select().from(connector).where(eq(connector.organizationId, m.orgId))
    : [];

  const connected = rows.map((r) => {
    let secretMask: string | null = null;
    try {
      secretMask = r.secret ? maskSecret(decryptSecret(r.secret)) : null;
    } catch {
      secretMask = "••••";
    }
    return { provider: r.provider, config: (r.config as Record<string, string>) ?? {}, secretMask };
  });

  return (
    <Shell>
      <Link href="/" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← Back
      </Link>
      <h1 className="mt-3 text-2xl font-semibold">Connectors</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Connect Aurume to the tools you use. Keys are encrypted and never shown again in full.
      </p>
      <ConnectorsClient providers={CONNECTOR_PROVIDERS} connected={connected} />
    </Shell>
  );
}
