import { and, eq } from "drizzle-orm";
import { db } from "./db";
import { connector } from "./db/schema";
import { decryptSecret } from "./crypto";

export type ConnectorField = {
  key: string;
  label: string;
  type: "text" | "password";
  secret: boolean;
  placeholder?: string;
};

export type ConnectorLogo = { bg: string; fg: string; mark: string };
export type ConnectorProvider = {
  id: string;
  name: string;
  description: string;
  category: string;
  logo: ConnectorLogo;
  available: boolean;
  fields: ConnectorField[];
};

// Category display order.
export const CONNECTOR_CATEGORIES = ["AI models", "Design & engineering", "Communication", "Integrations"];

// The registry drives the Connectors UI. Adding a provider later = add an entry here
// (and teach the relevant feature to read it). Only `available` ones can be configured.
export const CONNECTOR_PROVIDERS: ConnectorProvider[] = [
  {
    id: "resend",
    name: "Resend",
    category: "Communication",
    logo: { bg: "#000000", fg: "#fff", mark: "R" },
    description: "Send invitation and notification emails from your own domain.",
    available: true,
    fields: [
      { key: "apiKey", label: "API key", type: "password", secret: true, placeholder: "re_..." },
      { key: "fromEmail", label: "From address", type: "text", secret: false, placeholder: "Aurume <noreply@yourdomain.com>" },
    ],
  },
  {
    id: "slack",
    name: "Slack",
    category: "Communication",
    logo: { bg: "#4A154B", fg: "#fff", mark: "S" },
    description: "Connect your Slack workspace once; projects then point at their own channels.",
    available: true,
    fields: [
      { key: "botToken", label: "Bot user OAuth token", type: "password", secret: true, placeholder: "xoxb-..." },
    ],
  },
  {
    id: "teams",
    name: "Microsoft Teams",
    category: "Communication",
    logo: { bg: "#6264A7", fg: "#fff", mark: "T" },
    description: "Connect your Teams tenant once; projects then point at their own channels.",
    available: true,
    fields: [
      { key: "tenantId", label: "Tenant ID", type: "text", secret: false, placeholder: "00000000-0000-0000-0000-000000000000" },
      { key: "clientId", label: "Client (application) ID", type: "text", secret: false, placeholder: "app registration client id" },
      { key: "clientSecret", label: "Client secret", type: "password", secret: true, placeholder: "client secret value" },
    ],
  },
  {
    id: "anthropic",
    name: "Anthropic",
    category: "AI models",
    logo: { bg: "#D97757", fg: "#fff", mark: "A" },
    description: "Claude — the default LLM for playbook and artifact generation.",
    available: true,
    fields: [{ key: "apiKey", label: "API key", type: "password", secret: true, placeholder: "sk-ant-..." }],
  },
  {
    id: "openai",
    name: "OpenAI",
    category: "AI models",
    logo: { bg: "#10A37F", fg: "#fff", mark: "O" },
    description: "Alternative LLM provider (set AURUME_LLM_PROVIDER=openai to use).",
    available: true,
    fields: [{ key: "apiKey", label: "API key", type: "password", secret: true, placeholder: "sk-..." }],
  },
  {
    id: "ollama",
    name: "Ollama",
    category: "AI models",
    logo: { bg: "#111111", fg: "#fff", mark: "L" },
    description: "Local, self-hosted models (set AURUME_LLM_PROVIDER=ollama). No key needed.",
    available: true,
    fields: [{ key: "baseUrl", label: "Base URL", type: "text", secret: false, placeholder: "http://localhost:11434" }],
  },
  {
    id: "figma",
    name: "Figma",
    category: "Design & engineering",
    logo: { bg: "#F24E1E", fg: "#fff", mark: "F" },
    description: "Turn a Figma frame/component link into code (Design → code), in your chosen frontend language.",
    available: true,
    fields: [{ key: "token", label: "Personal access token", type: "password", secret: true, placeholder: "figd_..." }],
  },
  {
    id: "browserbase",
    name: "Browserbase",
    category: "Design & engineering",
    logo: { bg: "#6366F1", fg: "#fff", mark: "B" },
    description: "Cloud browsers for the UI testing agent — watch tests run in a live browser session.",
    available: true,
    fields: [
      { key: "apiKey", label: "API key", type: "password", secret: true, placeholder: "bb_live_..." },
      { key: "projectId", label: "Project ID", type: "text", secret: false, placeholder: "your Browserbase project id" },
    ],
  },
  { id: "jira", name: "Jira", description: "Sync stories to your Jira board.", category: "Integrations", logo: { bg: "#2684FF", fg: "#fff", mark: "J" }, available: false, fields: [] },
];

export function getProvider(id: string) {
  return CONNECTOR_PROVIDERS.find((p) => p.id === id) ?? null;
}

/**
 * Server-only: fetch a connector's non-secret config plus its decrypted secret, for the app
 * to actually use (e.g. the email sender). Returns null if not connected.
 */
export async function getConnector(organizationId: string, provider: string) {
  const row = (
    await db
      .select()
      .from(connector)
      .where(and(eq(connector.organizationId, organizationId), eq(connector.provider, provider)))
      .limit(1)
  )[0];
  if (!row) return null;
  return {
    config: (row.config as Record<string, string>) ?? {},
    secret: row.secret ? decryptSecret(row.secret) : null,
  };
}
