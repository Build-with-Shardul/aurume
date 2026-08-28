import type { TestRunner } from "./types";
import { ApiRunner } from "./runners/api";
import { ManualRunner } from "./runners/manual";

export * from "./types";
export { caseToFeature, storyToFeature } from "./gherkin";

export type RunnerCtx = { orgId: string; model?: string };

// The one-line swap: which engine backs a given kind of test. Phase 1 ships `api`
// (permissive, executed here) + `manual`; the `ui` engine (Browserbase) lands in
// Phase 2 behind this same interface.
export function getTestRunner(id: string, ctx: RunnerCtx): TestRunner {
  switch (id) {
    case "api":
      return new ApiRunner(ctx);
    case "manual":
    default:
      return new ManualRunner();
  }
}

/** Which runner should execute a given test-case category (null = not yet executable here). */
export function runnerForCategory(category: string): string | null {
  if (category === "api") return "api";
  if (category === "ui" || category === "accessibility") return null; // browser engine (Phase 2)
  return null; // performance/security → specialist tooling later
}
