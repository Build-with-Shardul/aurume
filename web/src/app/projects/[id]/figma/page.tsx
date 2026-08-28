import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { getActiveMembership, canCreateProject } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { project } from "@/lib/db/schema";
import { getConnector } from "@/lib/connectors";
import { currentProvider, MODEL_OPTIONS, defaultModel } from "@/lib/ai/provider";
import { allTargets } from "@/lib/figma/targets";
import FigmaClientView from "./figma-client";

export default async function FigmaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const m = await getActiveMembership();
  if (!m) redirect("/login");

  const p = (await db.select().from(project).where(eq(project.id, id)).limit(1))[0];
  if (!p || p.organizationId !== m.orgId) notFound();

  const canWork = canCreateProject(m.role) || p.createdBy === m.userId;
  const conn = await getConnector(m.orgId!, "figma").catch(() => null);
  const figmaConnected = !!conn?.secret || !!process.env.FIGMA_TOKEN;
  const provider = currentProvider();
  const modelInfo = { provider, options: MODEL_OPTIONS[provider], defaultModel: defaultModel(provider) };
  const targets = allTargets().map((t) => ({ id: t.id, label: t.label, language: t.language, styling: t.styling }));

  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-900">
      <div className="w-full px-6 py-10">
        <Link href={`/projects/${id}`} className="text-sm text-neutral-500 hover:text-neutral-900">← {p.name}</Link>
        <h1 className="mt-4 text-2xl font-semibold">Design → code</h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-500">
          Paste a Figma frame or component link and generate clean code in your chosen frontend language, following your standards.
        </p>
        <div className="mt-6">
          <FigmaClientView
            projectId={id}
            canWork={canWork}
            figmaConnected={figmaConnected}
            targets={targets}
            modelInfo={modelInfo}
          />
        </div>
      </div>
    </main>
  );
}
