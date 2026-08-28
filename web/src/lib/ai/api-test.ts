import { z } from "zod";
import { generateStructured } from "./provider";

// Turn an API test case (Gherkin, natural language) into a concrete, executable HTTP
// plan. The plan is then run deterministically (fetch + assertion checks) — the model
// only decides WHAT to call and assert, not the execution.

const HeaderSchema = z.object({ name: z.string(), value: z.string() });
const AssertionSchema = z.object({
  kind: z.enum(["status", "json_path", "body_contains", "header"]),
  path: z.string().describe("Dot-path into the JSON body for json_path (e.g. 'data.0.id'); header name for header; '' otherwise."),
  op: z.enum(["equals", "contains", "exists", "not_exists", "lt", "gt"]),
  value: z.string().describe("Expected value as a string; for status use the code (e.g. '200'). '' for exists/not_exists."),
});
const HttpStepSchema = z.object({
  name: z.string().describe("Short description of this request."),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  path: z.string().describe("Path relative to the base URL (e.g. '/v1/consent') or an absolute URL."),
  headers: z.array(HeaderSchema).describe("Request headers; [] if none."),
  body: z.string().nullish().describe("Request body as a raw string (usually JSON), or null."),
  assertions: z.array(AssertionSchema).describe("Checks against the response."),
});
export const ApiPlanSchema = z.object({
  steps: z.array(HttpStepSchema),
  notes: z.string().nullish().describe("Assumptions or anything unrunnable from the case."),
});
export type ApiPlan = z.infer<typeof ApiPlanSchema>;

const API_PLAN_SYSTEM = [
  "You convert an API test case (written in Gherkin) into a concrete, executable HTTP plan.",
  "Emit an ordered list of HTTP requests with methods, paths (relative to the given base URL where possible), headers, optional body, and response assertions that verify the Then/expected outcome.",
  "If authentication is provided, include it (e.g. an Authorization header). Chain steps when the case implies a sequence (create → read). Prefer specific assertions (status code, a json_path value, a body substring).",
  "Only emit requests the case actually describes; if something can't be executed as an HTTP call, leave a note rather than inventing endpoints.",
].join(" ");

export async function planApiTest(opts: {
  orgId: string;
  feature: string;
  baseUrl?: string;
  auth?: { bearer?: string; headers?: Array<{ name: string; value: string }> };
  model?: string;
}): Promise<ApiPlan> {
  const authLine = opts.auth?.bearer
    ? `AUTH: Bearer token available — add 'Authorization: Bearer <token>' (the runner injects the real token).`
    : opts.auth?.headers?.length
      ? `AUTH: these headers are available and injected by the runner: ${opts.auth.headers.map((h) => h.name).join(", ")}.`
      : "AUTH: none provided.";
  const prompt = [
    `BASE URL: ${opts.baseUrl || "(none — use absolute URLs)"}`,
    authLine,
    "",
    "TEST CASE (Gherkin):",
    opts.feature,
    "",
    "Produce the executable HTTP plan.",
  ].join("\n");

  const res = await generateStructured({
    orgId: opts.orgId,
    system: API_PLAN_SYSTEM,
    prompt,
    schema: ApiPlanSchema,
    schemaName: "api_plan",
    model: opts.model,
    maxTokens: 4000,
  });
  return res.data;
}
