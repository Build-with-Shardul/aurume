import type { RunOptions, TestCase, TestRunResult, TestRunner } from "../types";
import { getConnector } from "@/lib/connectors";

// UI agent runner: drives a live cloud browser (Browserbase) with an accessibility-tree
// grounded perceive → plan → act → observe loop, and streams a live view into the app.
// The connector gates it; the agent loop is built + iterated against a real target app.
export class UiRunner implements TestRunner {
  readonly id = "ui";
  readonly label = "UI agent (Browserbase)";
  readonly license = "permissive" as const;
  constructor(private ctx: { orgId: string; model?: string }) {}

  isConfigured(): boolean {
    return true; // the real (async) Browserbase check happens in run()
  }

  async run(_test: TestCase, _opts: RunOptions = {}): Promise<TestRunResult> {
    void _test;
    void _opts;
    const conn = await getConnector(this.ctx.orgId, "browserbase").catch(() => null);
    const apiKey = conn?.secret;
    const projectId = conn?.config?.projectId;
    if (!apiKey || !projectId) {
      return {
        runner: this.id,
        status: "error",
        steps: [],
        artifacts: [],
        error: "Connect Browserbase first: Settings → Connectors → Browserbase (API key + Project ID). The UI agent runs tests in a live cloud browser you can watch.",
      };
    }
    // Browserbase is connected. The perceive→plan→act loop (accessibility-tree grounding
    // via Playwright over CDP) is the next increment, built against a real target app so
    // it can be tuned on real runs.
    return {
      runner: this.id,
      status: "skipped",
      steps: [],
      artifacts: [{ kind: "log", note: "Browserbase connected. UI agent execution is being built — provide a target app URL + test credentials to start iterating." }],
    };
  }
}
