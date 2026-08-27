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
import {
  StoriesResultSchema,
  STORIES_SYSTEM,
  buildStoriesPrompt,
  scoreStoriesGroundedness,
  type StoriesResult,
} from "./stories";
import {
  TechDocContentSchema,
  TECHDOC_SYSTEM,
  buildTechDocPrompt,
  sanitizeCitations as sanitizeTechDocCitations,
  scoreGroundedness as scoreTechDocGroundedness,
  type TechDocContent,
} from "./techdoc";

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
};

/** Generate the grounded, structured PRODUCT playbook for a project. Pure — the caller persists it. */
export async function generateProductPlaybookDraft(params: {
  orgId: string;
  projectId: string;
  project: { name: string; description: string | null };
  features: Array<{ title: string; brief: string | null }>;
  members: Array<{ name: string; discipline: string | null }>;
  compliances: string[];
  model?: string;
}): Promise<PlaybookDraft> {
  const knowledge = await getKnowledgeForAI(params.projectId);
  const { contextText, refs } = buildKnowledgeContext(knowledge);
  const validRefs = new Set(refs.map((r) => r.ref));

  const prompt = buildPlaybookPrompt(params.project, params.features, params.members, params.compliances, contextText);
  const res = await generateStructured({
    orgId: params.orgId,
    system: PLAYBOOK_SYSTEM,
    prompt,
    schema: PlaybookContentSchema,
    schemaName: "playbook",
    model: params.model,
  });

  const content = sanitizeCitations(res.data, validRefs);
  const groundedness = scoreGroundedness(content, validRefs, refs.length);

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
  };
}

export type TechDocDraft = {
  content: TechDocContent;
  groundedness: number;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  costUsdMicros: number | null;
  sourceVersion: string;
  sourceKnowledge: Array<{ id: string; updatedAt: string }>;
  knowledgeCount: number;
};

/** Generate the grounded, structured Technical Design Document for a project. Pure — the caller persists it. */
export async function generateTechDocDraft(params: {
  orgId: string;
  projectId: string;
  project: { name: string; description: string | null };
  playbook: {
    summary: string;
    hypothesis: string;
    projectType: string;
    epics: Array<{ name: string; scopeDetail: string }>;
    kpis: Array<{ metric: string; targetValue: string }>;
    operational: string;
  } | null;
  features: Array<{ title: string; brief: string | null }>;
  compliances: string[];
  model?: string;
}): Promise<TechDocDraft> {
  const knowledge = await getKnowledgeForAI(params.projectId);
  const { contextText, refs } = buildKnowledgeContext(knowledge);
  const validRefs = new Set(refs.map((r) => r.ref));

  const prompt = buildTechDocPrompt(params.project, params.playbook, params.features, params.compliances, contextText);
  const res = await generateStructured({
    orgId: params.orgId,
    system: TECHDOC_SYSTEM,
    prompt,
    schema: TechDocContentSchema,
    schemaName: "tech_doc",
    model: params.model,
  });

  const content = sanitizeTechDocCitations(res.data, validRefs);
  const groundedness = scoreTechDocGroundedness(content, validRefs, refs.length);

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
  };
}

export type StoriesDraft = {
  stories: StoriesResult["stories"];
  groundedness: number;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  costUsdMicros: number | null;
  sourceVersion: string;
  knowledgeCount: number;
};

/** Generate grounded user stories for an epic. Pure — the caller persists them. */
export async function generateStoriesForEpic(params: {
  orgId: string;
  projectId: string;
  epic: { name: string; scopeDetail: string | null };
  product: { projectName: string; summary: string; hypothesis: string; projectType: string };
  compliances: string[];
  model?: string;
}): Promise<StoriesDraft> {
  const knowledge = await getKnowledgeForAI(params.projectId);
  const { contextText, refs } = buildKnowledgeContext(knowledge);
  const validRefs = new Set(refs.map((r) => r.ref));

  const prompt = buildStoriesPrompt(params.epic, params.product, params.compliances, contextText);
  const res = await generateStructured({
    orgId: params.orgId,
    system: STORIES_SYSTEM,
    prompt,
    schema: StoriesResultSchema,
    schemaName: "stories",
    model: params.model,
  });

  return {
    stories: res.data.stories,
    groundedness: scoreStoriesGroundedness(res.data, validRefs, refs.length),
    provider: res.provider,
    model: res.model,
    promptTokens: res.promptTokens,
    completionTokens: res.completionTokens,
    costUsdMicros: res.costUsdMicros,
    sourceVersion: sourceVersionHash(refs),
    knowledgeCount: refs.length,
  };
}
