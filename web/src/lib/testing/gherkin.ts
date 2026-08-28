// Convert an Aurume story into a Gherkin .feature — the common input every engine
// (Hercules or otherwise) accepts. This is our own code, permissively usable in any
// edition; it does not depend on any engine.

export type StoryForGherkin = {
  title: string;
  userStory: string | null; // "As a … I want … so that …"
  acceptanceCriteria: string[]; // each already a Given/When/Then statement
};

const KEYWORDS = /^\s*(given|when|then|and|but)\b/i;

function stepLine(raw: string, index: number): string {
  const s = raw.trim();
  if (!s) return "";
  if (KEYWORDS.test(s)) return `    ${s[0].toUpperCase()}${s.slice(1)}`;
  // No keyword — infer: first line is a When (action), the rest And.
  return `    ${index === 0 ? "When" : "And"} ${s}`;
}

export type CaseForGherkin = { title: string; preconditions?: string | null; steps: string[] };

/** Render a test case as a .feature — the executable input the engine runs. */
export function caseToFeature(c: CaseForGherkin): string {
  const lines: string[] = [`Feature: ${c.title}`, "", `  Scenario: ${c.title}`];
  if (c.preconditions?.trim()) lines.push(`    # Precondition: ${c.preconditions.trim()}`);
  const steps = c.steps.map(stepLine).filter(Boolean);
  lines.push(...(steps.length ? steps : ["    Given no steps were provided"]));
  lines.push("");
  return lines.join("\n");
}

/** Render one scenario from a story's acceptance criteria. */
export function storyToFeature(story: StoryForGherkin): string {
  const lines: string[] = [];
  lines.push(`Feature: ${story.title}`);
  if (story.userStory) {
    for (const l of story.userStory.split("\n")) lines.push(`  ${l.trim()}`);
  }
  lines.push("");
  lines.push(`  Scenario: ${story.title}`);
  const steps = story.acceptanceCriteria.map(stepLine).filter(Boolean);
  if (steps.length === 0) steps.push("    Given no acceptance criteria were provided");
  lines.push(...steps);
  lines.push("");
  return lines.join("\n");
}
