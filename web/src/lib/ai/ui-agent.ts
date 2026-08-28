import { z } from "zod";
import { generateStructured } from "./provider";

// The UI agent's brain: given the test's Gherkin and the current page's accessibility
// tree, pick the SINGLE next action. Grounding is by ARIA role + accessible name, so it
// survives DOM/CSS churn. Execution and assertion-checking happen in the runner.

export const UiActionSchema = z.object({
  thought: z.string().describe("One short sentence of reasoning."),
  action: z.enum(["navigate", "click", "fill", "press", "select", "assert", "wait", "done", "fail"]),
  role: z.string().describe("ARIA role of the target for click/fill/select (e.g. button, textbox, link, checkbox). '' if n/a."),
  name: z.string().describe("Accessible name / visible label / link text of the target. '' if n/a."),
  text: z.string().describe("navigate→URL; fill→value to type (use the token <<secret:NAME>> to enter a stored secret); press→key (e.g. Enter); select→option; wait→text to wait for. '' otherwise."),
  assertKind: z.enum(["none", "url_contains", "text_visible", "text_absent", "title_contains"]).describe("For the 'assert' action only; 'none' otherwise."),
  assertValue: z.string().describe("For 'assert': the expected substring."),
});
export type UiAction = z.infer<typeof UiActionSchema>;

const SYSTEM = [
  "You are a UI test agent driving a real browser. Given a test (Gherkin) and the current page's accessibility tree, choose the SINGLE next action that makes progress.",
  "Target elements by their ARIA role + accessible name (not CSS). Prefer visible, interactive elements shown in the tree.",
  "To type a stored secret (password/token), put the token <<secret:NAME>> as the fill value — the runner substitutes the real secret; usernames are given to you in plain text.",
  "Work through the Given/When steps, then verify each Then with an 'assert' action. When all expected outcomes are verified, choose 'done'. If the test cannot pass (element missing, wrong state), choose 'fail' and explain in thought.",
  "Do ONE action at a time; you'll see the updated page next.",
].join(" ");

export async function planUiAction(opts: {
  orgId: string;
  gherkin: string;
  url: string;
  title: string;
  tree: string; // compact accessibility tree
  history: string[]; // prior actions + outcomes
  credentialNames: string[];
  model?: string;
}): Promise<UiAction> {
  const prompt = [
    "TEST (Gherkin):",
    opts.gherkin,
    "",
    `CURRENT URL: ${opts.url}`,
    `PAGE TITLE: ${opts.title}`,
    opts.credentialNames.length ? `AVAILABLE CREDENTIALS (use <<secret:NAME>> for the secret): ${opts.credentialNames.join(", ")}` : "AVAILABLE CREDENTIALS: none",
    "",
    "ACCESSIBILITY TREE (interactive elements):",
    opts.tree.slice(0, 12000),
    "",
    opts.history.length ? `ACTIONS SO FAR:\n${opts.history.slice(-12).join("\n")}` : "ACTIONS SO FAR: none",
    "",
    "Choose the next action.",
  ].join("\n");

  const res = await generateStructured({
    orgId: opts.orgId,
    system: SYSTEM,
    prompt,
    schema: UiActionSchema,
    schemaName: "ui_action",
    model: opts.model,
    maxTokens: 1200,
  });
  return res.data;
}
