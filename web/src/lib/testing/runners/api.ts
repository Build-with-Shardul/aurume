import type { RunOptions, TestArtifact, TestCase, TestRunResult, TestStep, TestStatus, TestRunner } from "../types";
import { planApiTest, type ApiPlan } from "@/lib/ai/api-test";

type Ctx = { orgId: string; model?: string };

function getPath(obj: unknown, path: string): unknown {
  if (!path) return obj;
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc == null) return undefined;
    if (Array.isArray(acc)) return acc[Number(key)];
    if (typeof acc === "object") return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

function checkAssertion(a: ApiPlan["steps"][number]["assertions"][number], res: { status: number; headers: Headers; json: unknown; text: string }): { ok: boolean; detail: string } {
  const num = (v: unknown) => (typeof v === "number" ? v : Number(v));
  if (a.kind === "status") {
    const ok = res.status === Number(a.value);
    return { ok, detail: `status ${res.status} ${ok ? "==" : "!="} ${a.value}` };
  }
  if (a.kind === "header") {
    const got = res.headers.get(a.path) ?? "";
    const ok = a.op === "exists" ? got !== "" : a.op === "not_exists" ? got === "" : a.op === "contains" ? got.includes(a.value) : got === a.value;
    return { ok, detail: `header ${a.path}="${got}" ${a.op} ${a.value}` };
  }
  const got = a.kind === "json_path" ? getPath(res.json, a.path) : res.text;
  const gotStr = typeof got === "string" ? got : JSON.stringify(got);
  switch (a.op) {
    case "exists": return { ok: got !== undefined && got !== null, detail: `${a.path || "body"} exists → ${got !== undefined}` };
    case "not_exists": return { ok: got === undefined || got === null, detail: `${a.path || "body"} absent → ${got === undefined || got === null}` };
    case "contains": return { ok: (gotStr ?? "").includes(a.value), detail: `${a.path || "body"} contains "${a.value}" → ${(gotStr ?? "").includes(a.value)}` };
    case "lt": return { ok: num(got) < num(a.value), detail: `${gotStr} < ${a.value}` };
    case "gt": return { ok: num(got) > num(a.value), detail: `${gotStr} > ${a.value}` };
    default: return { ok: gotStr === a.value, detail: `${a.path || "body"}="${gotStr}" == "${a.value}"` };
  }
}

function resolveUrl(baseUrl: string | undefined, path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  if (!baseUrl) return path;
  return `${baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

/** Executes API test cases: the model plans the HTTP calls, the runner runs them and checks assertions. */
export class ApiRunner implements TestRunner {
  readonly id = "api";
  readonly label = "API runner";
  readonly license = "permissive" as const;
  constructor(private ctx: Ctx) {}

  isConfigured(): boolean {
    return true;
  }

  async run(test: TestCase, opts: RunOptions = {}): Promise<TestRunResult> {
    const baseUrl = opts.baseUrl ?? test.baseUrl;
    const started = Date.now();
    let plan: ApiPlan;
    try {
      plan = await planApiTest({ orgId: this.ctx.orgId, feature: test.feature, baseUrl, auth: opts.auth, model: this.ctx.model });
    } catch (e) {
      return { runner: this.id, status: "error", steps: [], artifacts: [], error: e instanceof Error ? e.message : String(e), durationMs: Date.now() - started };
    }
    if (!plan.steps.length) {
      return { runner: this.id, status: "skipped", steps: [], artifacts: [], error: plan.notes || "The model produced no runnable HTTP steps for this case.", durationMs: Date.now() - started };
    }

    const steps: TestStep[] = [];
    const artifacts: TestArtifact[] = [];
    let overall: TestStatus = "passed";

    for (const s of plan.steps) {
      const url = resolveUrl(baseUrl, s.path);
      const headers: Record<string, string> = {};
      for (const h of s.headers) headers[h.name] = h.value;
      if (opts.auth?.bearer) headers["Authorization"] = `Bearer ${opts.auth.bearer}`;
      for (const h of opts.auth?.headers ?? []) headers[h.name] = h.value;
      if (s.body && !Object.keys(headers).some((k) => k.toLowerCase() === "content-type")) headers["Content-Type"] = "application/json";

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 30000);
      let stepStatus: TestStatus = "passed";
      let detail = "";
      try {
        const res = await fetch(url, { method: s.method, headers, body: s.method === "GET" || s.method === "DELETE" ? undefined : s.body ?? undefined, signal: opts.signal ?? controller.signal });
        const text = await res.text();
        let json: unknown = undefined;
        try { json = JSON.parse(text); } catch { /* not json */ }
        const results = s.assertions.map((a) => checkAssertion(a, { status: res.status, headers: res.headers, json, text }));
        const failed = results.filter((r) => !r.ok);
        stepStatus = failed.length ? "failed" : "passed";
        detail = `${s.method} ${url} → ${res.status}` + (results.length ? ` · ${results.map((r) => `${r.ok ? "✓" : "✗"} ${r.detail}`).join(" · ")}` : "");
        artifacts.push({ kind: "log", note: `${s.method} ${url} → ${res.status} (${text.length} bytes)` });
      } catch (e) {
        stepStatus = "error";
        detail = `${s.method} ${url} → ${e instanceof Error ? e.message : String(e)}`;
      } finally {
        clearTimeout(timer);
      }
      steps.push({ text: s.name, status: stepStatus, detail });
      if (stepStatus === "error") overall = "error";
      else if (stepStatus === "failed" && overall !== "error") overall = "failed";
    }

    return { runner: this.id, status: overall, steps, artifacts, durationMs: Date.now() - started, logs: plan.notes ?? undefined };
  }
}
