import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import OpenAI from "openai";
import { z } from "zod";
import { getConnector } from "../connectors";

export type ProviderId = "anthropic" | "openai" | "ollama";

const DEFAULT_MODEL: Record<ProviderId, string> = {
  anthropic: "claude-opus-5",
  openai: "gpt-4o",
  ollama: "llama3.1",
};

// USD per 1M tokens, [input, output]. Unknown models → cost not estimated.
const RATES: Record<string, [number, number]> = {
  "claude-opus-5": [5, 25],
  "claude-opus-4-8": [5, 25],
  "claude-sonnet-5": [2, 10],
  "claude-haiku-4-5": [1, 5],
};

/** Thrown when no usable provider credential is configured — surfaced to the user. */
export class LLMConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LLMConfigError";
  }
}

export type GenResult<T> = {
  data: T;
  provider: ProviderId;
  model: string;
  promptTokens: number;
  completionTokens: number;
  costUsdMicros: number | null;
};

function estimateCostMicros(model: string, promptTokens: number, completionTokens: number): number | null {
  const rate = RATES[model];
  if (!rate) return null;
  const usd = (promptTokens / 1e6) * rate[0] + (completionTokens / 1e6) * rate[1];
  return Math.round(usd * 1e6);
}

type Config =
  | { provider: "anthropic" | "openai"; model: string; apiKey: string }
  | { provider: "ollama"; model: string; baseUrl: string };

async function resolveConfig(orgId: string): Promise<Config> {
  const provider = (process.env.AURUME_LLM_PROVIDER || "anthropic").toLowerCase() as ProviderId;
  if (!["anthropic", "openai", "ollama"].includes(provider)) {
    throw new LLMConfigError(`Unknown AURUME_LLM_PROVIDER "${provider}". Use anthropic, openai, or ollama.`);
  }
  const model = process.env.AURUME_LLM_MODEL || DEFAULT_MODEL[provider];
  const conn = await getConnector(orgId, provider).catch(() => null);

  if (provider === "ollama") {
    const baseUrl = conn?.config?.baseUrl || process.env.OLLAMA_BASE_URL || "http://localhost:11434";
    return { provider, model, baseUrl };
  }
  const envKey = provider === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY";
  const apiKey = conn?.secret || process.env[envKey];
  if (!apiKey) {
    throw new LLMConfigError(
      `No ${provider} API key. Add one in Settings → Connectors (${provider}) or set ${envKey}.`,
    );
  }
  return { provider, model, apiKey };
}

/**
 * Generate a validated object of shape `schema`, grounded by `prompt`, from whichever
 * provider the org/instance is configured for. The one method the whole AI layer needs.
 */
export async function generateStructured<T>(opts: {
  orgId: string;
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  schemaName: string;
  maxTokens?: number;
}): Promise<GenResult<T>> {
  const cfg = await resolveConfig(opts.orgId);
  const maxTokens = opts.maxTokens ?? 16000;

  if (cfg.provider === "ollama") {
    const res = await fetch(`${cfg.baseUrl.replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: cfg.model,
        stream: false,
        format: z.toJSONSchema(opts.schema),
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.prompt },
        ],
      }),
    });
    if (!res.ok) throw new LLMConfigError(`Ollama request failed (${res.status}). Is it running at ${cfg.baseUrl}?`);
    const j = (await res.json()) as { message?: { content?: string }; prompt_eval_count?: number; eval_count?: number };
    const data = opts.schema.parse(JSON.parse(j.message?.content ?? "{}"));
    return {
      data,
      provider: "ollama",
      model: cfg.model,
      promptTokens: j.prompt_eval_count ?? 0,
      completionTokens: j.eval_count ?? 0,
      costUsdMicros: null,
    };
  }

  if (cfg.provider === "anthropic") {
    const client = new Anthropic({ apiKey: cfg.apiKey });
    const resp = await client.messages.parse({
      model: cfg.model,
      max_tokens: maxTokens,
      system: opts.system,
      messages: [{ role: "user", content: opts.prompt }],
      output_config: { format: zodOutputFormat(opts.schema as z.ZodType) },
    });
    if (!resp.parsed_output) throw new Error("Model returned no structured output.");
    return {
      data: resp.parsed_output as T,
      provider: "anthropic",
      model: cfg.model,
      promptTokens: resp.usage.input_tokens,
      completionTokens: resp.usage.output_tokens,
      costUsdMicros: estimateCostMicros(cfg.model, resp.usage.input_tokens, resp.usage.output_tokens),
    };
  }

  // openai (cfg narrows to the api-key variant here)
  const client = new OpenAI({ apiKey: cfg.apiKey });
  const jsonSchema = z.toJSONSchema(opts.schema);
  const completion = await client.chat.completions.create({
    model: cfg.model,
    max_completion_tokens: maxTokens,
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.prompt },
    ],
    response_format: { type: "json_schema", json_schema: { name: opts.schemaName, schema: jsonSchema } },
  });
  const text = completion.choices[0]?.message?.content ?? "{}";
  const data = opts.schema.parse(JSON.parse(text));
  return {
    data,
    provider: "openai",
    model: cfg.model,
    promptTokens: completion.usage?.prompt_tokens ?? 0,
    completionTokens: completion.usage?.completion_tokens ?? 0,
    costUsdMicros: estimateCostMicros(cfg.model, completion.usage?.prompt_tokens ?? 0, completion.usage?.completion_tokens ?? 0),
  };
}
