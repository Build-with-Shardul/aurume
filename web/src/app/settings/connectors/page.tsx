import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getActiveMembership, canManageOrg } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { connector } from "@/lib/db/schema";
import { CONNECTOR_PROVIDERS, CONNECTOR_CATEGORIES } from "@/lib/connectors";
import { decryptSecret, maskSecret } from "@/lib/crypto";
import ConnectorsClient from "./connectors-client";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-900">
      <div className="w-full px-6 py-10">{children}</div>
    </main>
  );
}

export default async function ConnectorsPage() {
  const m = await getActiveMembership();
  if (!m) redirect("/login");

  if (!canManageOrg(m.role)) {
    return (
      <Shell>
        <h1 className="text-2xl font-semibold">Connectors</h1>
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
      <h1 className="text-2xl font-semibold">Connectors</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Connect Aurume to the tools you use. Keys are encrypted and never shown again in full.
      </p>
      <ConnectorsClient providers={CONNECTOR_PROVIDERS} connected={connected} categories={CONNECTOR_CATEGORIES} />
    </Shell>
  );
}
