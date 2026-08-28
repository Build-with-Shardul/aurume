import type { Page } from "playwright-core";
import type { RunOptions, TestArtifact, TestCase, TestRunResult, TestStatus, TestStep, TestRunner } from "../types";
import { getConnector } from "@/lib/connectors";
import { createSession, getLiveViewUrl, endSession } from "../browserbase";
import { planUiAction } from "@/lib/ai/ui-agent";

type Ctx = { orgId: string; model?: string };

function resolveSecrets(value: string, creds: NonNullable<RunOptions["credentials"]>): string {
  return value.replace(/<<secret:([^>]+)>>/g, (_m, name: string) => {
    const c = creds.find((x) => x.name.toLowerCase() === name.trim().toLowerCase());
    return c?.secret ?? "";
  });
}

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
    const steps: TestStep[] = [];
    const artifacts: TestArtifact[] = [];
    const history: string[] = [];
    const creds = opts.credentials ?? [];
    const maxSteps = opts.maxSteps ?? 16;
    let overall: TestStatus = "passed";
    let sawAssertion = false;

    let session: { id: string; connectUrl: string } | null = null;
    let browser: import("playwright-core").Browser | null = null;
    const { chromium } = await import("playwright-core");
    try {
      session = await createSession(apiKey, projectId);
      const live = await getLiveViewUrl(apiKey, session.id);
      if (live) artifacts.push({ kind: "report", url: live, note: "Live view / replay" });

      browser = await chromium.connectOverCDP(session.connectUrl);
      const context = browser.contexts()[0] ?? (await browser.newContext());
      const page: Page = context.pages()[0] ?? (await context.newPage());
      page.setDefaultTimeout(opts.timeoutMs ?? 12000);

      const start = opts.baseUrl ?? test.baseUrl;
      if (start) { await page.goto(start, { waitUntil: "domcontentloaded" }).catch(() => {}); }

      const credLine = creds.map((c) => `${c.name}${c.username ? ` (username: ${c.username})` : ""}`);

      for (let i = 0; i < maxSteps; i++) {
        const url = page.url();
        const title = await page.title().catch(() => "");
        const tree = await page.locator("body").ariaSnapshot().catch(() => "");

        const act = await planUiAction({ orgId: this.ctx.orgId, gherkin: test.feature, url, title, tree, history, credentialNames: credLine, model: this.ctx.model });
        const label = `${act.action}${act.name ? ` "${act.name}"` : act.text ? ` ${act.text.replace(/<<secret:[^>]+>>/g, "••••")}` : ""}`;

        if (act.action === "done") { steps.push({ text: `done — ${act.thought}`, status: "passed" }); break; }
        if (act.action === "fail") { steps.push({ text: `fail — ${act.thought}`, status: "failed", detail: act.thought }); overall = "failed"; break; }

        let stepStatus: TestStatus = "passed";
        let detail = act.thought;
        try {
          if (act.action === "navigate") {
            await page.goto(act.text, { waitUntil: "domcontentloaded" });
          } else if (act.action === "click") {
            const loc = act.role ? page.getByRole(act.role as Parameters<Page["getByRole"]>[0], { name: act.name }) : page.getByText(act.name);
            await loc.first().click();
          } else if (act.action === "fill") {
            const value = resolveSecrets(act.text, creds);
            const loc = act.role ? page.getByRole(act.role as Parameters<Page["getByRole"]>[0], { name: act.name }) : page.getByLabel(act.name);
            await loc.first().fill(value);
          } else if (act.action === "press") {
            await page.keyboard.press(act.text || "Enter");
          } else if (act.action === "select") {
            await page.getByRole("combobox", { name: act.name }).first().selectOption(act.text);
          } else if (act.action === "wait") {
            await page.getByText(act.text).first().waitFor();
          } else if (act.action === "assert") {
            sawAssertion = true;
            let ok = false;
            if (act.assertKind === "url_contains") ok = page.url().includes(act.assertValue);
            else if (act.assertKind === "title_contains") ok = (await page.title()).includes(act.assertValue);
            else if (act.assertKind === "text_visible") ok = await page.getByText(act.assertValue).first().isVisible().catch(() => false);
            else if (act.assertKind === "text_absent") ok = !(await page.getByText(act.assertValue).first().isVisible().catch(() => false));
            stepStatus = ok ? "passed" : "failed";
            detail = `${act.assertKind} "${act.assertValue}" → ${ok}`;
            if (!ok) overall = "failed";
          }
        } catch (e) {
          stepStatus = "error";
          detail = `${label}: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`;
          overall = overall === "failed" ? "failed" : "error";
        }
        steps.push({ text: label, status: stepStatus, detail });
        history.push(`${label} → ${stepStatus}${detail ? ` (${detail})` : ""}`);
        if (i === maxSteps - 1) { steps.push({ text: "step limit reached", status: "failed" }); if (overall === "passed") overall = "failed"; }
      }

      if (overall === "passed" && !sawAssertion) overall = "skipped"; // ran but verified nothing
    } catch (e) {
      return { runner: this.id, status: "error", steps, artifacts, error: e instanceof Error ? e.message : String(e), durationMs: Date.now() - started };
    } finally {
      await browser?.close().catch(() => {});
      if (session) await endSession(apiKey, projectId, session.id);
    }

    return { runner: this.id, status: overall, steps, artifacts, durationMs: Date.now() - started };
  }
}
