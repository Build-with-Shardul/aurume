import { getKnowledgeForAI } from "../knowledge";
import { generateStructured } from "./provider";
import {
  PlaybookContentSchema,
  PLAYBOOK_SYSTEM,
  buildKnowledgeContext,
  buildPlaybookPrompt,
  sanitizeCitations,
  scoreGroundedness,
  sourceVersionHash,
  type PlaybookContent,
} from "./playbook";

export type PlaybookDraft = {
  content: PlaybookContent;
  groundedness: number;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  costUsdMicros: number | null;
  sourceVersion: string;
  sourceKnowledge: Array<{ id: string; updatedAt: string }>;
  knowledgeCount: number;
  truncated: number;
};

/** Generate a grounded, structured playbook draft for a feature. Pure — the caller persists it. */
export async function generatePlaybookDraft(params: {
  orgId: string;
  projectId: string;
  feature: { title: string; brief: string | null };
}): Promise<PlaybookDraft> {
  const knowledge = await getKnowledgeForAI(params.projectId);
  const { contextText, refs } = buildKnowledgeContext(knowledge);
  const validRefs = new Set(refs.map((r) => r.ref));

  const prompt = buildPlaybookPrompt(params.feature, contextText);
  const res = await generateStructured({
    orgId: params.orgId,
    system: PLAYBOOK_SYSTEM,
    prompt,
    schema: PlaybookContentSchema,
    schemaName: "playbook",
  });

  const content = sanitizeCitations(res.data, validRefs);
  const groundedness = scoreGroundedness(content, validRefs);

  return {
    content,
    groundedness,
    provider: res.provider,
    model: res.model,
    promptTokens: res.promptTokens,
    completionTokens: res.completionTokens,
    costUsdMicros: res.costUsdMicros,
    sourceVersion: sourceVersionHash(refs),
    sourceKnowledge: refs.map((r) => ({ id: r.id, updatedAt: r.updatedAtISO })),
    knowledgeCount: refs.length,
    truncated: knowledge.length - refs.length,
  };
}
