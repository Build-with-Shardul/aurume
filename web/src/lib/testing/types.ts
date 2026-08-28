// The pluggable test-runner seam. Every testing engine (AGPL Hercules in the open
// edition, a commercially-licensed Hercules, or a permissive/own engine in a closed
// edition) implements this one interface — so switching engines is a config change,
// not a rewrite. Aurume-side code (story → feature, results → lineage) never imports
// an engine directly; it depends only on this contract.

export type TestStatus = "passed" | "failed" | "error" | "skipped";

export type TestStep = {
  text: string; // the Gherkin step or action
  status: TestStatus;
  detail?: string;
};

export type TestArtifact = {
  kind: "screenshot" | "video" | "trace" | "log" | "report" | "other";
  url?: string; // if the engine returns a reachable URL
  path?: string; // if the engine wrote a file
  note?: string;
};

export type TestRunResult = {
  runner: string; // which adapter produced this
  status: TestStatus; // overall verdict
  steps: TestStep[];
  artifacts: TestArtifact[];
  durationMs?: number;
  logs?: string;
  error?: string; // set when status === "error"
};

export type TestCase = {
  id: string;
  title: string;
  feature: string; // Gherkin feature text
  baseUrl?: string; // target under test
  testData?: Record<string, unknown>;
};

export type RunAuth = { bearer?: string; headers?: Array<{ name: string; value: string }> };

export type RunOptions = {
  model?: string; // BYO-key model the engine should use
  baseUrl?: string; // overrides TestCase.baseUrl
  auth?: RunAuth; // credentials injected into requests
  timeoutMs?: number;
  signal?: AbortSignal;
};

/** Licensing posture of an engine — surfaced so the UI/ops can see which edition a runner is for. */
export type RunnerLicense = "agpl-open" | "commercial" | "permissive" | "none";

export interface TestRunner {
  readonly id: string;
  readonly label: string;
  /** How this engine is licensed for use — governs which product edition may ship it. */
  readonly license: RunnerLicense;
  /** True if the engine is reachable/usable (e.g. its service URL is set). */
  isConfigured(): boolean;
  /** Execute one Gherkin test case and return a normalized result. Never throws — errors come back as status "error". */
  run(test: TestCase, opts?: RunOptions): Promise<TestRunResult>;
}
