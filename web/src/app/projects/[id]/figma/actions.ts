"use server";

import { eq } from "drizzle-orm";
import { getActiveMembership, canCreateProject } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { project, aiGeneration } from "@/lib/db/schema";
import { generateCodeFromFigma, type FigmaCodeResult } from "@/lib/ai/figma-code";
import { LLMConfigError } from "@/lib/ai/provider";

async function projectCtx(projectId: string) {
  const m = await getActiveMembership();
  if (!m?.orgId) return null;
  const p = (await db.select().from(project).where(eq(project.id, projectId)).limit(1))[0];
  if (!p || p.organizationId !== m.orgId) return null;
  const canWork = canCreateProject(m.role) || p.createdBy === m.userId;
  return { m, project: p, canWork };
}

export async function generateFigmaCode(
  projectId: string,
  url: string,
  target: string,
  model?: string,
): Promise<{ ok: true; result: FigmaCodeResult } | { error: string }> {
  const ctx = await projectCtx(projectId);
  if (!ctx) return { error: "Not allowed." };
  if (!ctx.canWork) return { error: "You don't have permission." };
  if (!url?.trim()) return { error: "Paste a Figma frame link." };

  const started = Date.now();
  let result: FigmaCodeResult;
  try {
    result = await generateCodeFromFigma({ orgId: ctx.m.orgId!, url: url.trim(), target, model });
  } catch (e) {
    if (e instanceof LLMConfigError) return { error: e.message };
    return { error: e instanceof Error ? e.message : "Generation failed." };
  }

  await db.insert(aiGeneration).values({
    id: crypto.randomUUID(),
    organizationId: ctx.m.orgId!,
    projectId,
    kind: "figma_code",
    provider: result.provider,
    model: result.model,
    promptTokens: result.promptTokens,
    completionTokens: result.completionTokens,
    costUsdMicros: result.costUsdMicros ?? null,
    latencyMs: Date.now() - started,
    outcome: "generated",
    createdBy: ctx.m.userId,
  });

  return { ok: true, result };
}
