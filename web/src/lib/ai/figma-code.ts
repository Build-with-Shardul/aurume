import { z } from "zod";
import { getConnector } from "../connectors";
import { FigmaClient } from "../figma/client";
import { parseFigmaUrl } from "../figma/url";
import { normalizeNodesResponse } from "../figma/normalize";
import { buildCodegenBrief } from "../figma/codegen";
import { getTarget } from "../figma/targets";
import { generateStructured, LLMConfigError } from "./provider";

export const CodeFilesSchema = z.object({
  files: z
    .array(
      z.object({
        path: z.string().describe("Suggested file path/name, e.g. components/BudgetCard.tsx"),
        language: z.string().describe("Language/format id, e.g. tsx, html, css, kotlin, dart, swift, vue, svelte"),
        content: z.string().describe("The complete file contents."),
      }),
    )
    .min(1),
  notes: z.string().nullish().describe("Anything the implementer should know (unmapped tokens, assumptions)."),
});
export type CodeFiles = z.infer<typeof CodeFilesSchema>;

export type FigmaCodeResult = {
  files: CodeFiles["files"];
  notes: string | null;
  target: string;
  sourceName: string;
  warnings: string[];
  tokensUsed: string[];
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  costUsdMicros: number | null;
};

/** Resolve the org's Figma personal access token (connector first, then env). */
async function figmaToken(orgId: string): Promise<string> {
  const conn = await getConnector(orgId, "figma").catch(() => null);
  const token = conn?.secret || process.env.FIGMA_TOKEN || process.env.FIGMA_ACCESS_TOKEN || "";
  if (!token) {
    throw new LLMConfigError("No Figma token. Add one in Settings → Connectors (Figma), or set FIGMA_TOKEN.");
  }
  return token;
}

/** Fetch a Figma frame, normalize it, and generate code for the chosen target via the org's LLM. */
export async function generateCodeFromFigma(opts: {
  orgId: string;
  url: string;
  target: string;
  model?: string;
}): Promise<FigmaCodeResult> {
  const profile = getTarget(opts.target);
  if (!profile) throw new Error(`Unknown target "${opts.target}".`);

  const { fileKey, nodeId } = parseFigmaUrl(opts.url);
  if (!nodeId) {
    throw new Error("That link has no frame selected. In Figma, right-click the frame → Copy link to selection (URL should include ?node-id=...).");
  }

  const token = await figmaToken(opts.orgId);
  const client = new FigmaClient({ token });
  const resp = await client.getNodes(fileKey, [nodeId]);
  const ir = normalizeNodesResponse(resp, { fileKey, nodeId, url: opts.url });
  const brief = buildCodegenBrief(ir, profile);

  const gen = await generateStructured({
    orgId: opts.orgId,
    system:
      "You are a senior frontend engineer. Implement the Figma design described in the brief as clean, production-ready code for the requested target, following the house standards and the token/component mappings exactly. Return only real code in the files array — no explanations outside `notes`.",
    prompt: brief,
    schema: CodeFilesSchema,
    schemaName: "figma_code",
    model: opts.model,
    maxTokens: 8000,
  });

  return {
    files: gen.data.files,
    notes: gen.data.notes ?? null,
    target: opts.target,
    sourceName: ir.source.name,
    warnings: ir.warnings,
    tokensUsed: ir.tokens.used,
    provider: gen.provider,
    model: gen.model,
    promptTokens: gen.promptTokens,
    completionTokens: gen.completionTokens,
    costUsdMicros: gen.costUsdMicros,
  };
}
