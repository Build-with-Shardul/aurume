"use server";

import { getActiveMembership } from "@/lib/auth-server";
import { answerQuestion } from "@/lib/ai/assistant";
import { LLMConfigError } from "@/lib/ai/provider";

export async function askAssistant(
  question: string,
  opts: { projectId?: string; history?: Array<{ role: "user" | "assistant"; content: string }> } = {},
) {
  const m = await getActiveMembership();
  if (!m?.orgId) return { error: "Not allowed." };
  if (!question?.trim()) return { error: "Ask a question." };
  try {
    const answer = await answerQuestion({
      orgId: m.orgId,
      projectId: opts.projectId,
      question: question.trim(),
      history: opts.history ?? [],
    });
    return { ok: true as const, answer };
  } catch (e) {
    if (e instanceof LLMConfigError) return { error: e.message };
    return { error: e instanceof Error ? e.message : "Couldn't answer that." };
  }
}
