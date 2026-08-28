import type { Page } from "playwright-core";
import type { RunCredential, TestStatus, TestStep } from "./types";
import { planUiAction } from "@/lib/ai/ui-agent";

function resolveSecrets(value: string, creds: RunCredential[]): string {
  return value.replace(/<<secret:([^>]+)>>/g, (_m, name: string) => {
    const c = creds.find((x) => x.name.toLowerCase() === name.trim().toLowerCase());
    return c?.secret ?? "";
  });
}

export type DriveOpts = {
  connectUrl: string;
  orgId: string;
  model?: string;
  feature: string;
  baseUrl?: string;
  credentials?: RunCredential[];
  maxSteps?: number;
  timeoutMs?: number;
  onStep?: (steps: TestStep[]) => void | Promise<void>;
};

/** Connect Playwright to a Browserbase session over CDP and run the perceive→plan→act
 *  loop, emitting each step (for live progress). Closes the browser when done. */
export async function driveUiAgent(opts: DriveOpts): Promise<{ status: TestStatus; steps: TestStep[] }> {
  const creds = opts.credentials ?? [];
  const maxSteps = opts.maxSteps ?? 16;
  const steps: TestStep[] = [];
  const history: string[] = [];
  let overall: TestStatus = "passed";
  let sawAssertion = false;

  const emit = async () => { if (opts.onStep) await opts.onStep([...steps]); };

  const { chromium } = await import("playwright-core");
  const browser = await chromium.connectOverCDP(opts.connectUrl);
  try {
    const context = browser.contexts()[0] ?? (await browser.newContext());
    const page: Page = context.pages()[0] ?? (await context.newPage());
    page.setDefaultTimeout(opts.timeoutMs ?? 12000);

    if (opts.baseUrl) await page.goto(opts.baseUrl, { waitUntil: "domcontentloaded" }).catch(() => {});
    const credLine = creds.map((c) => `${c.name}${c.username ? ` (username: ${c.username})` : ""}`);

    for (let i = 0; i < maxSteps; i++) {
      const url = page.url();
      const title = await page.title().catch(() => "");
      const tree = await page.locator("body").ariaSnapshot().catch(() => "");

      const act = await planUiAction({ orgId: opts.orgId, gherkin: opts.feature, url, title, tree, history, credentialNames: credLine, model: opts.model });
      const label = `${act.action}${act.name ? ` "${act.name}"` : act.text ? ` ${act.text.replace(/<<secret:[^>]+>>/g, "••••")}` : ""}`;

      if (act.action === "done") { steps.push({ text: `done — ${act.thought}`, status: "passed" }); await emit(); break; }
      if (act.action === "fail") { steps.push({ text: `fail — ${act.thought}`, status: "failed", detail: act.thought }); overall = "failed"; await emit(); break; }

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
      await emit();
      if (i === maxSteps - 1) { steps.push({ text: "step limit reached", status: "failed" }); if (overall === "passed") overall = "failed"; await emit(); }
    }
    if (overall === "passed" && !sawAssertion) overall = "skipped";
    return { status: overall, steps };
  } finally {
    await browser.close().catch(() => {});
  }
}
