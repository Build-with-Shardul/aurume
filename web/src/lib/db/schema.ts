import { relations } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  date,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
  role: text("role"),
  banned: boolean("banned").default(false),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires"),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    activeOrganizationId: text("active_organization_id"),
    impersonatedBy: text("impersonated_by"),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    issuer: text("issuer"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const organization = pgTable(
  "organization",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    logo: text("logo"),
    createdAt: timestamp("created_at").notNull(),
    metadata: text("metadata"),
  },
  (table) => [uniqueIndex("organization_slug_uidx").on(table.slug)],
);

export const member = pgTable(
  "member",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").default("member").notNull(),
    discipline: text("discipline"),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    index("member_organizationId_idx").on(table.organizationId),
    index("member_userId_idx").on(table.userId),
  ],
);

export const invitation = pgTable(
  "invitation",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role"),
    discipline: text("discipline"),
    status: text("status").default("pending").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    inviterId: text("inviter_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("invitation_organizationId_idx").on(table.organizationId),
    index("invitation_email_idx").on(table.email),
  ],
);

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  members: many(member),
  invitations: many(invitation),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

export const organizationRelations = relations(organization, ({ many }) => ({
  members: many(member),
  invitations: many(invitation),
}));

export const memberRelations = relations(member, ({ one }) => ({
  organization: one(organization, {
    fields: [member.organizationId],
    references: [organization.id],
  }),
  user: one(user, {
    fields: [member.userId],
    references: [user.id],
  }),
}));

export const invitationRelations = relations(invitation, ({ one }) => ({
  organization: one(organization, {
    fields: [invitation.organizationId],
    references: [organization.id],
  }),
  user: one(user, {
    fields: [invitation.inviterId],
    references: [user.id],
  }),
}));

// --- Aurume: 3rd-party connectors (Resend, and more later). Secret is encrypted at rest. ---
export const connector = pgTable(
  "connector",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(), // e.g. "resend"
    config: jsonb("config"), // non-secret settings (e.g. { fromEmail })
    secret: text("secret"), // encrypted (AES-256-GCM) — never returned to the client
    status: text("status").default("connected").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("connector_org_provider_uidx").on(t.organizationId, t.provider)],
);

// --- Aurume: custom disciplines (job titles) an admin adds on top of the built-in list. ---
export const discipline = pgTable(
  "discipline",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    value: text("value").notNull(), // slug stored on member/invitation
    label: text("label").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("discipline_org_value_uidx").on(t.organizationId, t.value)],
);

// --- Aurume: projects (root of the delivery/artifact chain) + their members. ---
export const project = pgTable(
  "project",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    budget: integer("budget"), // whole currency units
    currency: text("currency").default("USD").notNull(),
    startDate: date("start_date"),
    endDate: date("end_date"),
    slackChannel: text("slack_channel"), // project-specific channel id/name, uses the org Slack connector
    teamsChannel: text("teams_channel"), // project-specific channel id/name, uses the org Teams connector
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [index("project_org_idx").on(t.organizationId)],
);

export const projectMember = pgTable(
  "project_member",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    rate: integer("rate"), // hourly rate, in the project's currency
    timezone: text("timezone"), // IANA tz, e.g. "America/New_York"
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("project_member_uidx").on(t.projectId, t.userId),
    index("project_member_project_idx").on(t.projectId),
  ],
);

// A project's knowledge space: uploaded files + notes + (later) synced Slack/Teams
// messages. `content` holds extractable text the AI can reference; `storageKey`
// points at the blob in the storage backend for file items.
export const knowledgeItem = pgTable(
  "knowledge_item",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    // null = organization-level knowledge (not tied to a single project)
    projectId: text("project_id").references(() => project.id, { onDelete: "cascade" }),
    source: text("source").notNull().default("upload"), // upload | note | slack | teams
    title: text("title").notNull(), // file name, note title, or message summary
    mimeType: text("mime_type"),
    sizeBytes: integer("size_bytes"),
    storageKey: text("storage_key"), // key in the storage backend (null for notes/messages)
    content: text("content"), // extracted/plain text for AI retrieval
    uploadedBy: text("uploaded_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("knowledge_item_project_idx").on(t.projectId),
    index("knowledge_item_org_idx").on(t.organizationId),
  ],
);

// A Feature is the unit a playbook is generated for — the head of the
// Feature → Playbook → Stories → Tests delivery chain.
export const feature = pgTable(
  "feature",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    brief: text("brief"), // one-line problem/initiative statement
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [index("feature_project_idx").on(t.projectId)],
);

// Compliance frameworks a project must follow (checkbox selection). Selected items
// are fed into playbook generation so the output reflects those obligations.
export const projectCompliance = pgTable(
  "project_compliance",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    key: text("key").notNull(), // framework slug, or a slugified custom label
    label: text("label").notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("project_compliance_uidx").on(t.projectId, t.key)],
);

// A Playbook is a versioned, structured artifact generated (and then human-edited /
// A project has ONE product playbook — a versioned, structured artifact synthesized
// from all of the project's Features plus its knowledge. `content` is the structured
// JSON; lineage is captured by `sourceVersion` (a hash of the knowledge+feature
// snapshot) and `sourceKnowledge`. `stale` flags that features/knowledge changed
// since this version was generated. Agents propose; a version is locked only when the
// assigned approver approves.
export const playbook = pgTable(
  "playbook",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    version: integer("version").notNull().default(1),
    status: text("status").notNull().default("draft"), // draft | approved
    stale: boolean("stale").notNull().default(false), // features/knowledge changed since generation
    content: jsonb("content").notNull(),
    groundedness: integer("groundedness"), // 0–100, informational
    edited: boolean("edited").notNull().default(false),
    provider: text("provider"),
    model: text("model"),
    sourceVersion: text("source_version"),
    sourceKnowledge: jsonb("source_knowledge"),
    approverId: text("approver_id").references(() => user.id, { onDelete: "set null" }), // who should approve
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    approvedBy: text("approved_by").references(() => user.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at"),
  },
  (t) => [index("playbook_project_idx").on(t.projectId)],
);

// Telemetry for every AI generation — the "metrics over autonomy" thesis. Records
// cost/tokens/latency/model + groundedness at generation, and the human outcome
// (approved / edited / rejected) once the draft is acted on.
export const aiGeneration = pgTable(
  "ai_generation",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    projectId: text("project_id"),
    featureId: text("feature_id"),
    playbookId: text("playbook_id"),
    kind: text("kind").notNull().default("playbook"),
    provider: text("provider"),
    model: text("model"),
    promptTokens: integer("prompt_tokens"),
    completionTokens: integer("completion_tokens"),
    costUsdMicros: integer("cost_usd_micros"), // estimated cost in millionths of USD
    latencyMs: integer("latency_ms"),
    groundedness: integer("groundedness"),
    outcome: text("outcome").notNull().default("generated"), // generated | approved | edited | rejected
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("ai_generation_org_idx").on(t.organizationId)],
);
