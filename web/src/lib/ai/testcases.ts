import { z } from "zod";

// Structured test cases generated per epic (or per story), grounded in the stories'
// acceptance criteria and the technical design. Normalized so each case can be tagged
// into suites, tracked for coverage, and executed (its Gherkin steps = the .feature).

export const TEST_CATEGORY = ["happy", "edge", "negative", "api", "ui", "performance", "security", "accessibility"] as const;
export const TEST_PRIORITY = ["high", "medium", "low"] as const;
export const TEST_SUITE = ["smoke", "sanity", "regression", "e2e"] as const;

const TestCaseItemSchema = z.object({
  title: z.string(),
  category: z.enum(TEST_CATEGORY),
  priority: z.enum(TEST_PRIORITY),
  preconditions: z.string().describe("Setup/state required before the test, or '' if none."),
  steps: z.array(z.string()).describe("Gherkin steps, each a Given/When/Then/And line."),
  expectedResult: z.string().describe("The observable expected outcome."),
  suites: z.array(z.enum(TEST_SUITE)).describe("Which run-suites this case belongs to. smoke=critical happy path; sanity=focused post-change; regression=broad; e2e=multi-step journey."),
  storyRef: z.string().describe("The story ref this case covers (e.g. 'S1' from the provided list), or '' if cross-cutting."),
});
export type TestCaseItem = z.infer<typeof TestCaseItemSchema>;

export const TestCasesResultSchema = z.object({
  cases: z.array(TestCaseItemSchema),
  citations: z.array(z.string()).describe("Knowledge refs (e.g. K1) drawn on. Empty if none — never invent a ref."),
});
export type TestCasesResult = z.infer<typeof TestCasesResultSchema>;

export const TESTCASES_SYSTEM = [
  "You are a senior QA engineer writing comprehensive test cases for the given user stories, grounded in their acceptance criteria and the TECHNICAL DESIGN.",
  "Cover multiple categories: happy path, edge cases, negative/error handling, API, UI, plus at least a basic performance and security case where the design warrants, and accessibility where there's a UI.",
  "Write each case's steps as Gherkin (Given/When/Then/And). Give a clear expected result, a priority, and the run-suites it belongs to (smoke = a few critical happy-path checks; sanity = focused; regression = broad; e2e = full multi-step journeys).",
  "Set storyRef to the story each case covers (from the provided S# list), or '' for cross-cutting cases.",
  "If COMPLIANCE frameworks are listed, add cases that verify those obligations (consent, data handling, access control, auditability, accessibility).",
  "Cite knowledge refs you used. Be concrete and executable; a QA human will review and approve.",
].join(" ");

export function buildTestCasesPrompt(
  scope: { projectName: string; epicName?: string },
  stories: Array<{ ref: string; title: string; userStory: string | null; acceptanceCriteria: string[] }>,
  tdd: { architecture?: string; apisSummary?: string; security?: string } | null,
  compliances: string[],
  contextText: string,
): string {
  const storyBlock = stories.length
    ? stories
        .map((s) => `${s.ref}: ${s.title}${s.userStory ? `\n   ${s.userStory}` : ""}\n   AC:\n${(s.acceptanceCriteria.length ? s.acceptanceCriteria : ["(none)"]).map((a) => `     - ${a}`).join("\n")}`)
        .join("\n")
    : "(no stories provided)";
  return [
    `PROJECT: ${scope.projectName}`,
    scope.epicName ? `EPIC: ${scope.epicName}` : "",
    "",
    "STORIES (write cases for these; use the S# refs):",
    storyBlock,
    "",
    tdd ? "TECHNICAL DESIGN (ground technical/API/security cases in this):" : "",
    tdd?.architecture ? `Architecture: ${tdd.architecture}` : "",
    tdd?.apisSummary ? `APIs: ${tdd.apisSummary}` : "",
    tdd?.security ? `Security: ${tdd.security}` : "",
    "",
    compliances.length ? `COMPLIANCE to verify: ${compliances.join(", ")}` : "COMPLIANCE: none specified.",
    "",
    "KNOWLEDGE (cite by ref):",
    contextText.trim() || "(no knowledge provided)",
    "",
    "Produce the test cases per the required schema.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function citedRefs(result: TestCasesResult, validRefs: Set<string>): string[] {
  const found = new Set<string>();
  for (const c of result.citations) if (validRefs.has(c)) found.add(c);
  for (const m of JSON.stringify(result).matchAll(/\bK(\d+)\b/g)) {
    const ref = `K${m[1]}`;
    if (validRefs.has(ref)) found.add(ref);
  }
  return [...found].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
}

export function scoreGroundedness(result: TestCasesResult, validRefs: Set<string>, knowledgeCount: number): number {
  if (knowledgeCount === 0) return 0;
  const cited = citedRefs(result, validRefs).length;
  return Math.round((Math.min(cited, knowledgeCount) / knowledgeCount) * 100);
}
