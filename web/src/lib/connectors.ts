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

export type ConnectorProvider = {
  id: string;
  name: string;
  description: string;
  available: boolean;
  fields: ConnectorField[];
};

// The registry drives the Connectors UI. Adding a provider later = add an entry here
// (and teach the relevant feature to read it). Only `available` ones can be configured.
export const CONNECTOR_PROVIDERS: ConnectorProvider[] = [
  {
    id: "resend",
    name: "Resend",
    description: "Send invitation and notification emails from your own domain.",
    available: true,
    fields: [
      { key: "apiKey", label: "API key", type: "password", secret: true, placeholder: "re_..." },
      { key: "fromEmail", label: "From address", type: "text", secret: false, placeholder: "Aurume <noreply@yourdomain.com>" },
    ],
  },
  { id: "anthropic", name: "Anthropic", description: "LLM provider for AI generation.", available: false, fields: [] },
  { id: "jira", name: "Jira", description: "Sync stories to your Jira board.", available: false, fields: [] },
  { id: "slack", name: "Slack", description: "Post delivery updates to Slack.", available: false, fields: [] },
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
