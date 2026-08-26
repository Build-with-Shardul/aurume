import { createHash } from "crypto";
import { z } from "zod";

/**
 * The structured product playbook. A mix of AI-generated narrative + tables the AI
 * proposes, and stakeholder tables the user selects from the project's members.
 */
const StakeholderSchema = z.object({
  name: z.string(),
  team: z.string(),
  projectRole: z.string(),
});
const MilestoneSchema = z.object({
  milestone: z.string(),
  targetDate: z.string().describe("Target date, e.g. MM/DD/YYYY or a phase label."),
});
const EpicSchema = z.object({
  jiraId: z.string().describe("Jira epic id if known, else empty."),
  jiraUrl: z.string().describe("Link to the Jira epic if known, else empty."),
  name: z.string(),
  scopeDetail: z.string(),
});
const KpiSchema = z.object({
  metric: z.string(),
  targetValue: z.string(),
  measurementStrategy: z.string(),
});

export const PlaybookContentSchema = z.object({
  projectSummary: z.string().describe("A concise summary of the product/project."),
  keyHypothesis: z.string().describe("The core hypothesis/bet the product is making."),
  projectType: z.enum(["test", "scale"]).describe("'test' = a new feature to validate; 'scale' = scaling an existing feature."),
  techStakeholders: z.array(StakeholderSchema).describe("Proposed technical stakeholders drawn from the team members provided."),
  businessStakeholders: z.array(StakeholderSchema).describe("Proposed business stakeholders drawn from the team members provided."),
  milestones: z.array(MilestoneSchema).describe("Key project milestones with target dates."),
  inScopeEpics: z.array(EpicSchema).describe("In-scope epics. Leave jiraId/jiraUrl empty — the team fills those in."),
  adoptionMarkets: z.array(z.string()).describe("Markets/regions where this will be adopted, e.g. US, Canada."),
  futureScope: z.string().describe("Future scope beyond this release, or 'None identified.'"),
  kpis: z.array(KpiSchema).describe("KPIs / measurement strategy."),
  operationalChangeManagement: z.string().describe("Operational readiness and change management needed."),
  citations: z.array(z.string()).describe("Knowledge refs (e.g. K1, K3) the playbook drew on overall. Empty if none — never invent a ref."),
});

export type PlaybookContent = z.infer<typeof PlaybookContentSchema>;

/** An empty playbook shell — used to seed structured tables the user then fills. */
export const EMPTY_PLAYBOOK: PlaybookContent = {
  projectSummary: "",
  keyHypothesis: "",
  projectType: "test",
  techStakeholders: [],
  businessStakeholders: [],
  milestones: [],
  inScopeEpics: [],
  adoptionMarkets: [],
  futureScope: "",
  kpis: [],
  operationalChangeManagement: "",
  citations: [],
};

export type KnowledgeRef = { ref: string; id: string; updatedAtISO: string };

export function buildKnowledgeContext(
  items: Array<{ title: string; source: string; content: string; scope: string; updatedAtISO: string; id: string }>,
  tokenBudgetChars = 24000,
): { contextText: string; refs: KnowledgeRef[] } {
  const refs: KnowledgeRef[] = [];
  const lines: string[] = [];
  let used = 0;
  items.forEach((it, i) => {
    const ref = `K${i + 1}`;
    const block = `[${ref}] (${it.scope}) ${it.title}\n${it.content.trim()}\n`;
    if (used + block.length > tokenBudgetChars && lines.length > 0) return;
    used += block.length;
    refs.push({ ref, id: it.id, updatedAtISO: it.updatedAtISO });
    lines.push(block);
  });
  return { contextText: lines.join("\n"), refs };
}

export const PLAYBOOK_SYSTEM = [
  "You are a senior product manager drafting the single product playbook for a project.",
  "Synthesize ALL the listed FEATURES into one coherent product view, grounded in the provided KNOWLEDGE.",
  "Propose the technical and business stakeholders by drawing from the TEAM MEMBERS provided (use their names and disciplines); give each a plausible project role. If no members are provided, leave those arrays empty.",
  "For in-scope epics, propose epic names and scope details but leave jiraId and jiraUrl empty — the team fills those in.",
  "Classify projectType as 'test' (a new feature to validate) or 'scale' (an existing feature to scale).",
  "If COMPLIANCE frameworks are listed, the product MUST follow them: weave the obligations into the summary, key hypothesis, scope, epics, risks, KPIs, and operational/change-management sections (e.g. data handling, consent, accessibility, audit, retention).",
  "Cite the knowledge refs you used in the top-level citations. If knowledge doesn't support the content, write your best professional inference and leave citations empty — never invent a ref.",
  "Be concrete and concise. This is a draft a human will review and approve.",
].join(" ");

export function buildPlaybookPrompt(
  project: { name: string; description: string | null },
  features: Array<{ title: string; brief: string | null }>,
  members: Array<{ name: string; discipline: string | null }>,
  compliances: string[],
  contextText: string,
): string {
  const featureList = features.length
    ? features.map((f, i) => `${i + 1}. ${f.title}${f.brief ? ` — ${f.brief}` : ""}`).join("\n")
    : "(no features yet — draft at the product level and note low confidence)";
  const memberList = members.length
    ? members.map((mem) => `- ${mem.name}${mem.discipline ? ` (${mem.discipline})` : ""}`).join("\n")
    : "(no team members listed)";
  return [
    `PRODUCT / PROJECT: ${project.name}`,
    project.description ? `DESCRIPTION: ${project.description}` : "",
    "",
    "FEATURES:",
    featureList,
    "",
    "TEAM MEMBERS (for stakeholder tables):",
    memberList,
    "",
    compliances.length ? `COMPLIANCE this product MUST follow: ${compliances.join(", ")}` : "COMPLIANCE: none specified.",
    "",
    "KNOWLEDGE (cite by ref):",
    contextText.trim() || "(no knowledge provided)",
    "",
    "Produce the full product playbook per the required schema.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Groundedness = how much of the available knowledge the playbook actually cited. 0–100. */
export function scoreGroundedness(content: PlaybookContent, validRefs: Set<string>, knowledgeCount: number): number {
  if (knowledgeCount === 0) return 0;
  const cited = new Set(content.citations.filter((c) => validRefs.has(c)));
  return Math.round((Math.min(cited.size, knowledgeCount) / knowledgeCount) * 100);
}

export function sanitizeCitations(content: PlaybookContent, validRefs: Set<string>): PlaybookContent {
  return { ...content, citations: content.citations.filter((c) => validRefs.has(c)) };
}

export function sourceVersionHash(refs: KnowledgeRef[]): string {
  const material = refs.map((r) => `${r.id}@${r.updatedAtISO}`).sort().join("|");
  return createHash("sha256").update(material).digest("hex").slice(0, 16);
}
