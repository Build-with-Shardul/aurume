import type { RunOptions, TestArtifact, TestCase, TestRunResult, TestRunner } from "../types";
import { getConnector } from "@/lib/connectors";
import { createSession, getLiveViewUrl, endSession } from "../browserbase";
import { driveUiAgent } from "../ui-agent-loop";

type Ctx = { orgId: string; model?: string };

// Synchronous UI run (used by runTestCase). For the live/async experience the action
// creates the session itself and calls driveUiAgent in the background — see startUiRun.
export class UiRunner implements TestRunner {
  readonly id = "ui";
  readonly label = "UI agent (Browserbase)";
  readonly license = "permissive" as const;
  constructor(private ctx: Ctx) {}
  isConfigured(): boolean {
    return true;
  }

  async run(test: TestCase, opts: RunOptions = {}): Promise<TestRunResult> {
    const conn = await getConnector(this.ctx.orgId, "browserbase").catch(() => null);
    const apiKey = conn?.secret;
    const projectId = conn?.config?.projectId;
    if (!apiKey || !projectId) {
      return { runner: this.id, status: "error", steps: [], artifacts: [], error: "Connect Browserbase first: Settings → Connectors → Browserbase (API key + Project ID)." };
    }
    const started = Date.now();
    const artifacts: TestArtifact[] = [];
    let session: { id: string; connectUrl: string } | null = null;
    try {
      session = await createSession(apiKey, projectId);
      artifacts.push({ kind: "report", url: `https://www.browserbase.com/sessions/${session.id}`, note: "Session replay (review after the run)" });
      const live = await getLiveViewUrl(apiKey, session.id);
      if (live) artifacts.push({ kind: "report", url: live, note: "Live view (only while running)" });

      const { status, steps } = await driveUiAgent({
        connectUrl: session.connectUrl,
        orgId: this.ctx.orgId,
        model: this.ctx.model,
        feature: test.feature,
        baseUrl: opts.baseUrl ?? test.baseUrl,
        credentials: opts.credentials,
        maxSteps: opts.maxSteps,
        timeoutMs: opts.timeoutMs,
      });
      return { runner: this.id, status, steps, artifacts, durationMs: Date.now() - started };
    } catch (e) {
      return { runner: this.id, status: "error", steps: [], artifacts, error: e instanceof Error ? e.message : String(e), durationMs: Date.now() - started };
    } finally {
      if (session) await endSession(apiKey, projectId, session.id);
    }
  }
}
