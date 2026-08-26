import { createHash } from "crypto";
import { z } from "zod";

/**
 * The structured shape of a product playbook. The model fills this exactly; each
 * section cites the knowledge refs it drew on so we can score groundedness.
 */
export const SECTIONS = [
  { key: "problem", heading: "Problem & context", guide: "The problem this feature solves and why now. Ground in the knowledge base." },
  { key: "goals", heading: "Goals & non-goals", guide: "What success looks like, and what is explicitly out of scope as a goal." },
  { key: "users", heading: "Target users", guide: "Who this is for — segments/personas, their jobs-to-be-done." },
  { key: "metrics", heading: "Success metrics", guide: "Measurable indicators (leading + lagging). Name the metric and target direction." },
  { key: "hypotheses", heading: "Hypotheses & bets", guide: "The core bets: 'we believe X will cause Y'. Testable." },
  { key: "scope", heading: "Scope (in / out)", guide: "What is in scope for v1 and what is deferred." },
  { key: "risks", heading: "Risks & assumptions", guide: "Key risks, dependencies, and assumptions that must hold." },
  { key: "questions", heading: "Open questions", guide: "What is still unknown and needs a decision." },
] as const;

export type SectionKey = (typeof SECTIONS)[number]["key"];
export const SECTION_KEYS = SECTIONS.map((s) => s.key) as [SectionKey, ...SectionKey[]];

export const PlaybookSectionSchema = z.object({
  key: z.enum(SECTION_KEYS),
  heading: z.string(),
  content: z.string().describe("Markdown prose for this section."),
  citations: z.array(z.string()).describe("Knowledge refs (e.g. K1, K3) this section drew on. Empty if none — do not invent refs."),
});

export const PlaybookContentSchema = z.object({
  summary: z.string().describe("One-paragraph executive summary of the feature."),
  sections: z.array(PlaybookSectionSchema).describe("One entry per required section, in order."),
});

export type PlaybookContent = z.infer<typeof PlaybookContentSchema>;

export type KnowledgeRef = { ref: string; id: string; updatedAtISO: string };

/** Build the grounding context block + a ref→realId map from knowledge rows. */
export function buildKnowledgeContext(
  items: Array<{ title: string; source: string; content: string; scope: string; updatedAtISO: string; id: string }>,
  tokenBudgetChars = 24000,
): { contextText: string; refs: KnowledgeRef[]; truncated: number } {
  const refs: KnowledgeRef[] = [];
  const lines: string[] = [];
  let used = 0;
  let truncated = 0;
  items.forEach((it, i) => {
    const ref = `K${i + 1}`;
    const body = it.content.trim();
    const block = `[${ref}] (${it.scope}) ${it.title}\n${body}\n`;
    if (used + block.length > tokenBudgetChars && lines.length > 0) {
      truncated++;
      return;
    }
    used += block.length;
    refs.push({ ref, id: it.id, updatedAtISO: it.updatedAtISO });
    lines.push(block);
  });
  return { contextText: lines.join("\n"), refs, truncated };
}

export const PLAYBOOK_SYSTEM = [
  "You are a senior product manager drafting the single product playbook for a project.",
  "The playbook covers the whole product across its listed FEATURES — synthesize them into one coherent product view, not a per-feature list.",
  "Ground every claim in the provided KNOWLEDGE. When a section draws on knowledge, cite the refs (e.g. K1, K3) in that section's citations.",
  "If the knowledge does not support a section, write your best professional inference but leave citations empty — never invent a ref that isn't in KNOWLEDGE.",
  "Be concrete and concise. This is a draft a human will review and approve.",
].join(" ");

export function buildPlaybookPrompt(
  project: { name: string; description: string | null },
  features: Array<{ title: string; brief: string | null }>,
  contextText: string,
): string {
  const sectionSpec = SECTIONS.map((s) => `- ${s.key} (${s.heading}): ${s.guide}`).join("\n");
  const featureList = features.length
    ? features.map((f, i) => `${i + 1}. ${f.title}${f.brief ? ` — ${f.brief}` : ""}`).join("\n")
    : "(no features yet — draft a product-level playbook from the project and knowledge, and note low confidence)";
  return [
    `PRODUCT / PROJECT: ${project.name}`,
    project.description ? `DESCRIPTION: ${project.description}` : "",
    "",
    "FEATURES this product includes:",
    featureList,
    "",
    "KNOWLEDGE (cite by ref):",
    contextText.trim() || "(no knowledge provided — rely on the project and features, and note low confidence)",
    "",
    "Produce ONE product playbook with a one-paragraph summary and exactly these sections, in order:",
    sectionSpec,
    "",
    "Each section: a `key` from the list above, its `heading`, `content` in markdown, and `citations` (the refs it used).",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Groundedness = share of required sections that cite at least one valid ref. 0–100. */
export function scoreGroundedness(content: PlaybookContent, validRefs: Set<string>): number {
  const required = SECTION_KEYS.length;
  if (required === 0) return 0;
  let grounded = 0;
  for (const key of SECTION_KEYS) {
    const section = content.sections.find((s) => s.key === key);
    if (section && section.citations.some((c) => validRefs.has(c))) grounded++;
  }
  return Math.round((grounded / required) * 100);
}

/** Drop any citation refs the model invented (not in the provided set). */
export function sanitizeCitations(content: PlaybookContent, validRefs: Set<string>): PlaybookContent {
  return {
    ...content,
    sections: content.sections.map((s) => ({ ...s, citations: s.citations.filter((c) => validRefs.has(c)) })),
  };
}

/** A stable hash of the exact knowledge snapshot used — the lineage fingerprint. */
export function sourceVersionHash(refs: KnowledgeRef[]): string {
  const material = refs
    .map((r) => `${r.id}@${r.updatedAtISO}`)
    .sort()
    .join("|");
  return createHash("sha256").update(material).digest("hex").slice(0, 16);
}
