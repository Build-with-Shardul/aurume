# Aurume — Gaps & Backlog

**What this is:** an honest inventory of everything Aurume still needs. It complements
[`PROJECT_PLAN.md`](./PROJECT_PLAN.md) (the vision + locked decisions) and
[`adr/0001-auth-rbac-and-tenancy.md`](./adr/0001-auth-rbac-and-tenancy.md) (how auth/RBAC works).
The plan says *where we're going*; this says *what isn't built yet*.

Last updated: 2026-08-25.

**Legend** — Priority: 🔴 core differentiator / blocks the thesis · 🟠 important · 🟡 nice-to-have.
Effort: S (≤1 day) · M (a few days) · L (a week+) · XL (multi-week / its own repo).

---

## Where we are today (shipped)

The **platform shell** is real and working: multi-org tenancy, capability-based RBAC
(roles + growable disciplines), invitations with email fallback, encrypted org connectors,
an instance super-admin (god-mode + impersonation), projects (budget/currency/dates,
per-member rate + timezone, lifecycle-aware settings, Slack/Teams channel binding), and a
per-project **knowledge space** that rolls up into an **organization knowledge base**, with
`getKnowledgeForAI(projectId)` as the retrieval hook.

**What is NOT built: the entire AI layer and the lineage/delivery chain — i.e. the product's
actual reason to exist.** Everything below the first section is either that, or the supporting
work it needs.

---

## 1. The AI layer — the whole differentiator 🔴

Nothing here exists. `getKnowledgeForAI()` returns text but **nothing consumes it**. This is the
next thing to build and the reason the knowledge/connector/project scaffolding was built first.

| Gap | What's missing | Effort | Depends on |
|---|---|---|---|
| **Playbook drafter** | In-app: template → structured, grounded product playbook, calling `getKnowledgeForAI`. First AI feature. | XL | provider abstraction, retrieval |
| **Feature entity** | Projects have no **Features**. The chain is Feature → Playbook → Stories → Tests. `feature` table + CRUD + UI don't exist. | M | — |
| **Spec → stories (RAG)** | Generate user stories from an approved playbook, grounded in knowledge. | XL | embeddings, playbook |
| **Story → tests** | Generate test cases / acceptance criteria from stories. | XL | stories |
| **Delivery evals** | Groundedness / quality scoring of generated artifacts (the portfolio thesis: *metrics over autonomy*). | L | any generation |
| **Delivery graph (LangGraph)** | Orchestrate the multi-step chain with human-in-the-loop gates. | XL | all of the above |
| **Provider abstraction** | Plan D-09: OpenAI/Anthropic/Ollama, BYO key. Anthropic connector is listed "coming soon" but there's no LLM client, no key wiring, no model routing. | M | connectors |
| **Approval gates** | Plan D-06: *agents propose, humans commit*. No draft → review → approve → commit state machine on any artifact. | L | features/playbook |

## 2. Lineage & the delivery chain — the moat 🔴

The positioning is **traceability**: every artifact stores parent ID + source version, so you can
trace requirement → test → live pass/fail. **None of this exists.**

| Gap | What's missing | Effort |
|---|---|---|
| **Artifact model with lineage** | A base notion of an artifact (playbook, story, test…) carrying `parentId` + `sourceVersion`. | L |
| **Versioning** | Artifacts are immutable-ish with versions; today projects/knowledge just mutate in place. | M |
| **Traceability graph / UI** | Visualize requirement → story → test → result. The headline feature. | L |
| **Live pass/fail linkage** | Connect tests to real execution results (CI, QA runs). | XL |

## 3. Knowledge space — completeness 🟠

The knowledge space works for upload/note/list/download/delete and org rollup. Missing:

| Gap | What's missing | Effort |
|---|---|---|
| **Document parsing** | Only plain-text files get `content` extracted ([`api/.../knowledge/route.ts`](../web/src/app/api/projects/[id]/knowledge/route.ts)). PDF/docx/xlsx/pptx and image OCR are **not** parsed, so they don't feed the AI yet. | L |
| **Embeddings + vector search** | Plan D-08: Postgres + **pgvector**. Not installed. `getKnowledgeForAI` returns raw rows — no chunking, embeddings, or relevance ranking. Won't scale past a handful of items. | L |
| **Full-text search UI** | No way to search knowledge. | M |
| **Continuous Slack/Teams ingestion** | Connectors + per-project channels are placeholders. No poller/webhook turns channel messages into `knowledge_item` rows (`source: slack|teams`). | L |
| **Auto-regeneration on change** | "When knowledge updates, downstream docs update." No change-trigger, no job runner, and no generated docs to regenerate yet. | L |
| **Quotas & limits** | 25 MB/file cap only; no per-org total quota, no upload rate limiting. | S |
| **File hygiene** | No virus/malware scan, no dedup, no file-level versioning. | M |

## 4. Connectors & integrations 🟠

| Gap | What's missing | Effort |
|---|---|---|
| **Connection validation** | Slack/Teams/Resend creds are stored without a "Test connection" — an invalid token isn't caught until use. | S |
| **Slack/Teams read (sync)** | See §3 — pulling messages in. | L |
| **Slack/Teams write** | Original "post delivery updates to Slack/Teams" is not built. | M |
| **Teams auth reality-check** | Teams connector collects tenant/client/secret (Graph app) but no OAuth/Graph client uses them. | M |
| **More providers** | Jira (sync stories), Anthropic (LLM) are "coming soon" stubs only. | M each |

## 5. Projects & workspace management 🟠

| Gap | What's missing | Effort |
|---|---|---|
| **Delete a project** | No per-project delete UI; only the super-admin deleting a whole org. | S |
| **Project-level roles** | `project_member` is flat (rate/timezone). No per-project capability/role beyond "creator or org admin can manage". Plan implies a project scope in the capability matrix. | M |
| **Budget actuals / spend tracking** | Budget + member hourly rates are captured but never used — no hours logging, no burn vs. budget. | L |
| **Timezone usage** | Member timezones are stored but unused (no working-hours view, scheduling, or overlap display). | M |
| **Explicit "Start project"** | "Started" is auto-derived from the start date. No manual start action (offered, not chosen). | S |
| **Archived / status states** | Projects have only Started/Not-started (derived). No archived/completed/on-hold. | S |

## 6. Auth, security & compliance 🟠

| Gap | What's missing | Effort |
|---|---|---|
| **SSO / SAML / OIDC** | Deferred by decision; Better Auth architecture is ready. Add when a customer IdP is real. | L |
| **Audit log** | No trail of who did what (invites, role changes, deletes, impersonation, connector edits). Critical for the gated-enterprise target. | L |
| **Impersonation logging** | Super-admin impersonation works but isn't recorded. | S |
| **Secret-key management** | ✅ *Done* — connector secrets now use **envelope encryption** ([`crypto.ts`](../web/src/lib/crypto.ts)): per-secret data keys wrapped by a KEK from a dedicated `AURUME_ENCRYPTION_KEY` (falls back to `BETTER_AUTH_SECRET`). Auth-secret rotation no longer breaks connectors; `AURUME_ENCRYPTION_KEY` rotation only re-wraps data keys (Platform admin → "Re-wrap connector secrets", with `AURUME_ENCRYPTION_KEY_RETIRED`). Remaining: a real KMS/HSM backend for the KEK (currently env-derived). | — |
| **Real email sending** | Invites fall back to console when Resend isn't configured ([`email.ts`](../web/src/lib/email.ts)). No verified-domain send, templates, or delivery handling. | S |
| **Data export / deletion (GDPR)** | No per-user/org export or right-to-erasure flow. | M |
| **Rate limiting / abuse** | No rate limiting on auth, uploads, or actions. | M |

## 7. Platform & ops 🟠

| Gap | What's missing | Effort |
|---|---|---|
| **Production blob storage** | Knowledge files use **filesystem** storage ([`storage.ts`](../web/src/lib/storage.ts), `AURUME_UPLOADS_DIR`). Fine for self-host/dev; won't survive serverless. Needs an S3/R2 backend behind the same interface. | M |
| **Telemetry / observability** | Plan says instrument from repo 1 (tokens, cost, latency, human-acceptance) — *can't reconstruct later*. Nothing is instrumented. | L |
| **Automated tests** | The web shell has **no test suite** (unit, integration, or e2e). | L |
| **CI/CD for the app** | Only the `site/` landing deploys (GitHub Pages). No pipeline, migrations gate, or hosting decided for the Next.js shell. | M |
| **DB migrations discipline** | Schema changes go via `drizzle-kit push` against Neon. No versioned migration files / review gate. | M |
| **Hosting decision** | Where the shell runs in prod is undecided (affects storage, background jobs, secrets). | — |
| **Background job runner** | Needed for §3 ingestion/regeneration and §1 async generation. None exists. | M |

## 8. UX & polish 🟡

| Gap | What's missing | Effort |
|---|---|---|
| **Accessibility audit** | The shell UI hasn't been checked against WCAG (the brand site has a bar; the app doesn't). | M |
| **Loading / empty / error states** | Partial across pages. | M |
| **Notifications** | No in-app or email notifications for events (invites accepted, artifact ready, etc.). | M |
| **Mobile pass** | Not verified on small screens. | S |
| **Onboarding** | No guided first-run beyond `/setup`. | M |

## 9. Known bugs / tech debt 🟠

| Item | Detail |
|---|---|
| **`getKnowledgeForAI` scaling** | Concatenates all org rows with content and filters in JS — fine now, needs chunking/embeddings before real corpora (see §3). |
| **No connector "in use" guard** | Disconnecting a connector doesn't check whether projects reference it (e.g. bound Slack channels). |

---

## Suggested next order

1. **Provider abstraction + Playbook drafter + Feature entity** (§1) — turns the knowledge base
   into visible output; the differentiator finally exists.
2. **Embeddings/pgvector + document parsing** (§3) — makes retrieval real instead of a toy.
3. **Lineage/artifact model + approval gates** (§1/§2) — the moat.
4. **Slack/Teams ingestion + background jobs** (§3/§7) — the knowledge base fills itself.
5. Harden as you go: audit log, telemetry, tests, prod storage (§6/§7).

Everything before step 1 is done. Step 1 is where the product starts being *Aurume* rather than
a well-built workspace.
