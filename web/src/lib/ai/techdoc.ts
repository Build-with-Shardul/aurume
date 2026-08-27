import { z } from "zod";

/**
 * The structured Technical Design Document — the technical counterpart to the
 * product playbook. A mix of AI-generated narrative and tables, grounded in the
 * playbook, features, compliance, and knowledge.
 */
const ComponentSchema = z.object({
  name: z.string(),
  responsibility: z.string(),
  tech: z.string().describe("Language/framework/service used, if known."),
});
const EntitySchema = z.object({
  entity: z.string(),
  fields: z.string().describe("Key fields, comma-separated."),
  notes: z.string().describe("Relationships / constraints / indexes."),
});
const ApiSchema = z.object({
  method: z.string().describe("HTTP method or RPC/operation kind."),
  path: z.string().describe("Route/endpoint or operation name."),
  purpose: z.string(),
  auth: z.string().describe("Auth/authorization required, e.g. 'member', 'admin', 'public'."),
});
const TechChoiceSchema = z.object({
  layer: z.string().describe("e.g. Frontend, API, Data, Infra, Auth."),
  choice: z.string(),
  rationale: z.string(),
});
const RiskSchema = z.object({
  risk: z.string(),
  impact: z.string().describe("High/Medium/Low + why."),
  mitigation: z.string(),
});

export const TechDocContentSchema = z.object({
  overview: z.string().describe("What is being built, technically, and why — 1–2 paragraphs."),
  goals: z.array(z.string()).describe("Technical goals this design must achieve."),
  nonGoals: z.array(z.string()).describe("Explicitly out of scope for this design."),
  architectureOverview: z.string().describe("The system architecture in prose: major pieces and how they interact."),
  components: z.array(ComponentSchema).describe("The key components/services and their responsibilities."),
  dataModel: z.array(EntitySchema).describe("Core data entities and their key fields/relationships."),
  apis: z.array(ApiSchema).describe("Key APIs/interfaces the design exposes or depends on."),
  keyFlows: z.string().describe("Step-by-step narrative of the most important operation(s)/sequence(s)."),
  techStack: z.array(TechChoiceSchema).describe("Technology choices per layer with a short rationale."),
  securityPrivacy: z.string().describe("Security and privacy design: authz, data handling, secrets, PII, threats."),
  scalabilityPerformance: z.string().describe("Scaling and performance considerations, limits, caching, bottlenecks."),
  observability: z.string().describe("Logging, metrics, tracing, alerting for this design."),
  risksTradeoffs: z.array(RiskSchema).describe("Technical risks / tradeoffs / alternatives considered."),
  testingStrategy: z.string().describe("How this will be tested: unit, integration, e2e, and what's critical."),
  rolloutPlan: z.string().describe("Migration/rollout/feature-flag/backout plan."),
  openQuestions: z.array(z.string()).describe("Unresolved technical questions for reviewers."),
  citations: z.array(z.string()).describe("Knowledge refs (e.g. K1, K3) drawn on overall. Empty if none — never invent a ref."),
});

export type TechDocContent = z.infer<typeof TechDocContentSchema>;

export const EMPTY_TECH_DOC: TechDocContent = {
  overview: "",
  goals: [],
  nonGoals: [],
  architectureOverview: "",
  components: [],
  dataModel: [],
  apis: [],
  keyFlows: "",
  techStack: [],
  securityPrivacy: "",
  scalabilityPerformance: "",
  observability: "",
  risksTradeoffs: [],
  testingStrategy: "",
  rolloutPlan: "",
  openQuestions: [],
  citations: [],
};

export const TECHDOC_SYSTEM = [
  "You are a staff software engineer / architect writing the Technical Design Document (TDD) for the product described by the PRODUCT PLAYBOOK.",
  "Design a concrete, buildable technical solution that satisfies the playbook's summary, hypothesis, in-scope epics, and KPIs — grounded in the provided KNOWLEDGE and the project's existing stack where known.",
  "If COMPLIANCE frameworks are listed, the design MUST address them technically: data handling, encryption, consent, access control, audit logging, retention, accessibility.",
  "Fill every section. Propose sensible components, data entities, APIs, and technology choices with short rationales; be specific, not generic.",
  "Cite the knowledge refs you used in the top-level citations. If knowledge doesn't support a choice, write your best engineering judgment and leave citations empty — never invent a ref.",
  "This is a draft a human engineer will review and approve.",
].join(" ");

export function buildTechDocPrompt(
  project: { name: string; description: string | null },
  playbook: {
    summary: string;
    hypothesis: string;
    projectType: string;
    epics: Array<{ name: string; scopeDetail: string }>;
    kpis: Array<{ metric: string; targetValue: string }>;
    operational: string;
  } | null,
  features: Array<{ title: string; brief: string | null }>,
  compliances: string[],
  contextText: string,
): string {
  const featureList = features.length
    ? features.map((f, i) => `${i + 1}. ${f.title}${f.brief ? ` — ${f.brief}` : ""}`).join("\n")
    : "(no features listed)";
  const epicList = playbook?.epics?.length
    ? playbook.epics.map((e, i) => `${i + 1}. ${e.name}${e.scopeDetail ? ` — ${e.scopeDetail}` : ""}`).join("\n")
    : "(no in-scope epics)";
  const kpiList = playbook?.kpis?.length ? playbook.kpis.map((k) => `- ${k.metric}: ${k.targetValue}`).join("\n") : "(none)";
  return [
    `PRODUCT / PROJECT: ${project.name}`,
    project.description ? `DESCRIPTION: ${project.description}` : "",
    "",
    "PRODUCT PLAYBOOK (design to satisfy this):",
    playbook ? `Summary: ${playbook.summary}` : "(no playbook yet — infer from features and note lower confidence)",
    playbook ? `Key hypothesis: ${playbook.hypothesis}` : "",
    playbook ? `Type: ${playbook.projectType}` : "",
    playbook ? `In-scope epics:\n${epicList}` : "",
    playbook ? `KPIs:\n${kpiList}` : "",
    playbook?.operational ? `Operational/change mgmt: ${playbook.operational}` : "",
    "",
    "FEATURES:",
    featureList,
    "",
    compliances.length ? `COMPLIANCE the design MUST address: ${compliances.join(", ")}` : "COMPLIANCE: none specified.",
    "",
    "KNOWLEDGE (cite by ref):",
    contextText.trim() || "(no knowledge provided)",
    "",
    "Produce the full Technical Design Document per the required schema.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Valid knowledge refs the doc actually used — citations array + inline [Kn] mentions. */
export function citedRefs(content: TechDocContent, validRefs: Set<string>): string[] {
  const found = new Set<string>();
  for (const c of content.citations) if (validRefs.has(c)) found.add(c);
  for (const m of JSON.stringify(content).matchAll(/\bK(\d+)\b/g)) {
    const ref = `K${m[1]}`;
    if (validRefs.has(ref)) found.add(ref);
  }
  return [...found].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
}

export function scoreGroundedness(content: TechDocContent, validRefs: Set<string>, knowledgeCount: number): number {
  if (knowledgeCount === 0) return 0;
  const cited = citedRefs(content, validRefs).length;
  return Math.round((Math.min(cited, knowledgeCount) / knowledgeCount) * 100);
}

export function sanitizeCitations(content: TechDocContent, validRefs: Set<string>): TechDocContent {
  return { ...content, citations: citedRefs(content, validRefs) };
}
