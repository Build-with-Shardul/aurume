import { z } from "zod";

export const StorySchema = z.object({
  title: z.string().describe("Short story title."),
  userStory: z.string().describe("As a <role>, I want <capability>, so that <benefit>."),
  acceptanceCriteria: z.array(z.string()).describe("Acceptance criteria, each as a Given/When/Then statement."),
  priority: z.enum(["must", "should", "could", "wont"]).describe("MoSCoW priority."),
  points: z.number().int().describe("Story point estimate (1, 2, 3, 5, 8)."),
  citations: z.array(z.string()).describe("Knowledge refs used (e.g. K1). Empty if none — never invent a ref."),
});
export type Story = z.infer<typeof StorySchema>;

export const StoriesResultSchema = z.object({
  stories: z.array(StorySchema).describe("The user stories that fully cover this epic's scope."),
});
export type StoriesResult = z.infer<typeof StoriesResultSchema>;

export const STORIES_SYSTEM = [
  "You are a senior product manager breaking an epic into implementable user stories.",
  "Cover the epic's scope completely with a coherent, non-overlapping set of stories.",
  "Each story: a clear 'As a <role>, I want <capability>, so that <benefit>' statement, and testable Given/When/Then acceptance criteria.",
  "Respect the PRODUCT CONTEXT and any COMPLIANCE obligations — add explicit stories or acceptance criteria for consent, data handling, retention, accessibility, and audit where relevant.",
  "Cite the knowledge refs you used per story. If knowledge doesn't support a story, write your best professional inference and leave citations empty — never invent a ref.",
  "Be concrete and concise. These are drafts a human will review and approve.",
].join(" ");

export function buildStoriesPrompt(
  epic: { name: string; scopeDetail: string | null },
  product: { projectName: string; summary: string; hypothesis: string; projectType: string },
  compliances: string[],
  contextText: string,
): string {
  return [
    `PRODUCT: ${product.projectName} (${product.projectType})`,
    `PRODUCT SUMMARY: ${product.summary}`,
    `KEY HYPOTHESIS: ${product.hypothesis}`,
    "",
    `EPIC: ${epic.name}`,
    epic.scopeDetail ? `EPIC SCOPE: ${epic.scopeDetail}` : "",
    "",
    compliances.length ? `COMPLIANCE this product MUST follow: ${compliances.join(", ")}` : "COMPLIANCE: none specified.",
    "",
    "KNOWLEDGE (cite by ref):",
    contextText.trim() || "(no knowledge provided)",
    "",
    "Produce the user stories that fully cover this epic's scope, per the required schema.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Distinct valid knowledge refs used across all stories (citations array + inline [Kn]). */
export function storiesCitedRefs(result: StoriesResult, validRefs: Set<string>): string[] {
  const found = new Set<string>();
  for (const s of result.stories) for (const c of s.citations) if (validRefs.has(c)) found.add(c);
  for (const m of JSON.stringify(result).matchAll(/\bK(\d+)\b/g)) {
    const ref = `K${m[1]}`;
    if (validRefs.has(ref)) found.add(ref);
  }
  return [...found];
}

export function scoreStoriesGroundedness(result: StoriesResult, validRefs: Set<string>, knowledgeCount: number): number {
  if (knowledgeCount === 0) return 0;
  const cited = storiesCitedRefs(result, validRefs).length;
  return Math.round((Math.min(cited, knowledgeCount) / knowledgeCount) * 100);
}
