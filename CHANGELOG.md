# Changelog

All notable changes to Aurume are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/), and the project aims to follow
[Semantic Versioning](https://semver.org/). This is early development — APIs,
schema, and behavior can change between pre-releases.

## [Unreleased]

## [0.2.0] — 2026-08-27

The **AI delivery chain comes online**. On top of the 0.1.0 shell, this release
adds the first grounded AI features and the planning layer that turns their output
into a checkable schedule: a project playbook → epics → grounded stories →
a budget/timeline/Gantt plan with resources, leave, dependencies, and a critical
path. Every AI step stays gated (agents propose, humans commit), grounded, and
metered (tokens/cost/groundedness). Pre-release.

### Added
- **Playbook drafter (v1)** — grounded, structured product-playbook generation, the
  first AI feature. A project has many **Features** but **one product playbook**,
  synthesized from all its features plus `getKnowledgeForAI` (org + project
  knowledge). Rich structure: Summary & Key Hypothesis, Test/Scale classification,
  Key technology & business stakeholder tables (selected from project members),
  Project milestones, In-scope epics (with Jira links), Adoption markets, Future
  scope, KPIs & measurement strategy, and Operational & change management —
  AI-generated and fully editable, with an informational **groundedness score**.
  Two-column workspace: features on the left (add/edit/remove) plus a **Compliance**
  checklist (GDPR, HIPAA, SOC 2, PCI DSS, WCAG, … + custom) whose selections are fed
  into generation so the playbook reflects those obligations; the product playbook on
  the right; changing a feature or compliance marks the playbook **out of date** until
  you update it. You assign an **approver**; agents propose, humans commit — the assigned
  approver reviews, edits, and **approves** (locking a version). **Multiple approvers**
  with per-approval timestamps, a **model picker** at generation, a per-version
  **generation log** (tokens/cost), an org-wide **AI usage** dashboard, and **Word/PDF
  export** (bordered, colored-header tables + approval status). Lineage + telemetry
  recorded per generation. Provider-agnostic behind one `generateStructured` —
  **Anthropic** (default, `claude-opus-5`), **OpenAI**, **Ollama** — BYO key via the
  encrypted connector or env. New tables: `feature`, `playbook`, `ai_generation`.
- **Epics & stories (spec-to-stories)** — the next link in the delivery chain.
  Promote a playbook's In-scope epics into first-class, editable **Epic** records
  (lineage: source playbook + version), or add epics manually. Each epic generates
  grounded **user stories** via AI: "As a / I want / So that" + **Given/When/Then
  acceptance criteria** + MoSCoW priority + story points + citations, reflecting the
  project's compliance selections. Stories are drafts you review, edit, and
  approve individually (agents propose, humans commit). Stories can be generated
  from an unapproved playbook — a warning shows and the lineage records whether the
  source was approved. Reuses the provider-agnostic model picker, groundedness
  scoring, and token/cost telemetry (kind = stories, in the usage dashboard).
  New tables: `epic`, `story`.
- **Plan & schedule (budget + timeline + Gantt)** — turns points into a checkable plan.
  A project sets **1 story point = N hours** (1/2/3/8 or custom, at creation and in
  settings); each member has an **hours/day capacity**; stories get an **assignee**
  (and optional manual date pins — hybrid scheduling). A pure engine
  (`lib/schedule.ts`) computes story hours → cost (× the assignee's rate), schedules
  each assignee's work back-to-back from the project start skipping weekends, and
  rolls up per epic/assignee. The **Plan** dashboard (`/projects/[id]/plan`) shows a
  **Budget** verdict (within / over by X vs. the project budget), a **Timeline**
  verdict (on time / late / early vs. the expected end), **utilization**, total work, a
  resource-planner **Gantt** (month/week/day columns, role grouping, per-person and
  global utilization %) with two toggle views (by assignee swimlanes / by epic) and an
  expected-end marker, and a per-assignee hours/cost table. Epics show total story
  points. Stories flagged when unassigned/unpointed/rate-less (partial cost/timeline).
  New columns: `project.hoursPerPoint`, `projectMember.hoursPerDay`,
  `story.assigneeId` + `startDate`/`endDate`.
- **Leaves + Resources (cross-project)** — resources and time off.
  - **Leave/time off** is stored per person org-wide (`leave` table); the scheduler
    now skips a person's leave days (and they reduce capacity), so adding leave —
    or reassigning a story or changing points — reshuffles the plan automatically.
    Leave shows as a striped bar on the Gantt.
  - **Resources admin** (`/resources`, owner/admin): a directory of everyone with
    their projects and leave count; each resource opens a cross-project view —
    project assignments (hours/cost/window), a calendar across all their projects
    (each project scheduled independently, overlaid), monthly allocation (hours per
    project per month), and leave management (add/remove). Linked from the dashboard.
    New table: `leave`.
- **Story dependencies (cross-assignee cascade)** — a story can depend on other
  stories ("depends on" picker in the story editor, `story.dependsOn`). The scheduler
  is dependency-aware: a story starts no earlier than its assignee is free AND all its
  dependencies have finished — so a slip on one person's work (e.g. a leave) cascades
  to dependents even when they're assigned to someone else. Topological greedy
  scheduling with cycle-breaking. Verified: a leave-delayed story pushed a dependent
  story (different assignee) later and moved the whole project end.
- **Gantt dependency arrows + critical-path highlighting** — the schedule draws an
  arrow from each dependency to the story it blocks (elbow connectors, in both the
  by-role and by-epic views), and highlights the **critical path** — the chain of
  stories (dependency hops and same-assignee sequencing) that sets the projected end,
  computed in the engine (`ScheduledStory.critical`) by walking back from the
  last-finishing story through whichever predecessor ended latest. Critical bars get a
  red ring and critical dependency arrows turn solid red; a slip anywhere on that chain
  moves the end date. Toggles for **Dependencies** and **Critical path**.

### Changed
- **Project page: Plan & schedule promoted to the top** — the plan is now the primary
  (dark, emphasized) card above Knowledge space, instead of a trailing block.
- Gantt rows use a fixed-height flat render model so each bar maps to a pixel position
  for the dependency-arrow overlay.

## [0.1.0] — 2026-08-25

The first cut of the **Aurume platform shell**: the identity, project, and
knowledge spine that later AI features are meant to be born *into* (gated,
scoped, and grounded). Everything below landed on 2026-08-25. Pre-release.

### Added

**Project & governance**
- Open-source foundation: **AGPLv3** license, an individual **CLA** enforced by a
  CLA Assistant Lite bot, plus `CODE_OF_CONDUCT`, `SECURITY`, `CONTRIBUTING`,
  `NOTICE`, and GitHub issue templates (bug report / feature request).
- **aurume.dev** landing page deployed via GitHub Pages on the custom domain —
  hero, principles, a **Tech stack** section, roadmap, tidy mobile nav, and
  footer links (Changelog → Releases, Known issues, Report a bug).
- `docs/adr/0001-auth-rbac-and-tenancy.md` — the auth, RBAC, and multi-org
  tenancy design of record.

**Identity, auth & RBAC**
- Shell app scaffolded (Next.js 16, TypeScript, Tailwind, pnpm) with **Better Auth**
  (organization + admin + access-control plugins), **Drizzle ORM**, and **Neon**
  Postgres.
- **Capability-based RBAC** (`resource.action`): a small fixed permission-role set
  (owner / admin / manager / contributor / stakeholder / finance / viewer).
- **Multi-org tenancy** with three scopes — instance, organization, project — and
  org isolation on every row.
- First-run **`/setup`** (create the super admin + first org), **`/login`**, and
  the **people** area (`/admin/people`) to invite members with a permission role.
- **Invitations** carry a **discipline (job title)** and send via the org's
  connected Resend, falling back to env, then console. Accept flow at
  `/accept-invitation/[id]` sets a password and applies the discipline on join.
- **Disciplines** are a separate, growable descriptive field (full agile list),
  with **custom titles** addable per workspace — distinct from permission roles.
- **Instance Super Admin** (`/superadmin`): platform god-mode across every org —
  grant/revoke super admin, ban/unban, delete an org (cascade), and **impersonate**
  any user with a Stop-impersonating banner; self-protected.

**Connectors**
- **Encrypted org connectors** (`/settings/connectors`, owner/admin): a provider
  registry with connect/update/disconnect. Secrets are encrypted at rest and
  masked in the UI, never returned to the client.
- **Slack** and **Microsoft Teams** connectors available (workspace/tenant-level),
  alongside Resend; Anthropic and Jira staged as "coming soon".

**Projects**
- Project **creation** and **member management** — unique ID, name, description,
  budget + currency, expected start/end; creator auto-added; RBAC-gated create.
- Per-member **hourly rate + timezone** so globally distributed teams are modeled.
- Dates entered and shown as **MM/DD/YYYY** (stored ISO).
- **Required fields** on creation: budget, currency, start, end, and each added
  member's rate + timezone — enforced in the UI and server-side.
- Project **settings page** (`/projects/[id]/settings`, ⚙ by the title) with
  **lifecycle-aware editing**: budget editable anytime; the expected start locks
  once the project has started (start date ≤ today), after which only the
  expected end is editable. A Started / Not-started badge on the project.
- **Slack & Teams channel binding** per project ("Connected channels"), showing
  the workspace connection status — groundwork for pulling channel updates later.

**Knowledge space**
- **Per-project knowledge space** (`/projects/[id]/knowledge`): any member uploads
  any file type (25 MB cap) or adds freeform notes. Pluggable **filesystem** blob
  storage (swappable for S3/R2), auth-checked streaming download, and delete that
  removes both the row and the blob. Plain-text files get their content extracted
  on upload.
- **Organization knowledge space** (`/knowledge`): every project's knowledge rolls
  up here (tagged by project) alongside org-wide uploads/notes.
- **`getKnowledgeForAI(projectId)`** — the retrieval hook the AI layer will call —
  returns the entire org knowledge base tagged by scope
  (organization / this-project / other-project), so a new project immediately
  benefits from prior work while still weighting its own.

### Security
- **Envelope encryption** for connector secrets: a random per-secret data key
  encrypts the payload and is itself wrapped by a key-encryption key derived from
  a dedicated **`AURUME_ENCRYPTION_KEY`** (falling back to `BETTER_AUTH_SECRET`).
  Rotating the auth secret no longer breaks connectors; rotating the encryption
  key only re-wraps the small data keys, via a Platform-admin **"Re-wrap connector
  secrets"** action and an `AURUME_ENCRYPTION_KEY_RETIRED` keyring. Legacy secrets
  still decrypt and upgrade transparently.

### Changed
- Project detail page: **Project ID** moved directly under the project name; the
  redundant "managed in project settings" helper line removed.

### Fixed
- Super-admin: widened the `run()` action helper's return type so `{ ok }`-returning
  actions type-check (the project now type-checks clean).

### Docs
- **`docs/GAPS.md`** — an honest inventory of everything not yet built (the AI
  layer, lineage/delivery chain, ingestion, ops, and more) with priority, effort,
  and a suggested build order.

[0.2.0]: https://github.com/Build-with-Shardul/aurume/releases/tag/v0.2.0
[0.1.0]: https://github.com/Build-with-Shardul/aurume/releases/tag/v0.1.0
