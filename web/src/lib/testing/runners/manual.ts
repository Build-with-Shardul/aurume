import type { RunOptions, TestCase, TestRunResult, TestRunner } from "../types";

// Phase-0 fallback: no automated execution — hand the .feature back for a human to run.
export class ManualRunner implements TestRunner {
  readonly id = "manual";
  readonly label = "Manual (export .feature)";
  readonly license = "none" as const;
  isConfigured(): boolean {
    return true;
  }
  async run(test: TestCase, _opts: RunOptions = {}): Promise<TestRunResult> {
    void _opts;
    return {
      runner: this.id,
      status: "skipped",
      steps: [],
      artifacts: [{ kind: "report", note: "Exported for manual execution", path: `${test.title}.feature` }],
      logs: test.feature,
    };
  }
}
