# Changelog

All notable changes to Aurume are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/), and the project aims to follow
[Semantic Versioning](https://semver.org/). This is early development — APIs,
schema, and behavior can change between pre-releases.

## [Unreleased]

### Changed
- **App shell: full-width workspace + collapsible left sidebar** — replaced the
  per-page top nav bars with one persistent **collapsible sidebar** (Projects, Org
  knowledge, Resources, Manage people, AI usage, a **Settings** group → Profile / My
  role / Connectors, plus Platform admin, and the signed-in user + sign-out), and made
  every page **full width**. New `AppSidebar`/`AppChrome` mounted in the root layout
  (shown only when authenticated; login/setup/accept-invitation stay bare); collapse
  state persists. Added minimal **Profile** and **My role** settings pages. Browser tab
  title is now "Aurume". The sidebar shows a **project sub-nav** when you're inside a
  project (Overview, Plan, Knowledge, Features & playbook, Design → code, Tech design
  doc, Epics, Test cases, Settings) with the active section highlighted. Also swept all
  unused-variable lint warnings (0 remaining).

### Added
- **Testing engine — pluggable runner + API executor (Phase 0/1)** — the execution
  side of the delivery chain, closing requirement → test → verdict. A license-neutral
  **`TestRunner` seam** (`lib/testing`: interface + registry + story/case→Gherkin
  exporter) so the execution backend is a config-swap, not a rewrite. Ships the
  **API runner**: the model turns a test case's Gherkin into a concrete HTTP plan
  (method/path/headers/body + assertions), which the runner executes with `fetch` and
  checks deterministically (status / json-path / body / header). A **Run** button on
  API cases (base URL + optional bearer token), inline per-step results, a last-run
  badge, and persisted **`test_run`** rows (lineage: story → case → run → verdict).
  Permissive/own engine (no AGPL) — the UI (browser) runner lands next behind the same
  interface. New table: `test_run`. Verified: a real API case ran green against a live
  API (all assertions passed), and mismatched endpoints correctly report failed.
- **UI testing agent — Browserbase plumbing (Phase 2 scaffold)** — the seam + config
  for the browser agent, ahead of the agent loop itself. A **Browserbase connector**
  (encrypted API key + project id), an encrypted per-project **test-credentials store**
  (`test_credential`; the agent injects logins/tokens at run time — secrets envelope-
  encrypted, never sent to the client), a config-gated **`ui` runner** behind the same
  `TestRunner` interface (`ui`/`accessibility` cases route to it; clear "connect
  Browserbase" message until keyed), and a **Testing engine & credentials** panel on the
  Test Cases page (runner status + credential manager). New table: `test_credential`.
- **UI testing agent — the browser agent loop (Browserbase)** — a UI test case now runs
  in a live cloud browser: the runner creates a Browserbase session, connects Playwright
  over CDP, and drives a **perceive → plan → act → observe** loop — the page's
  **accessibility tree** (`ariaSnapshot`) + the Gherkin go to the model, which picks one
  grounded action at a time (navigate / click / fill / press / select / assert), targeted
  by **ARIA role + accessible name** so it survives DOM churn. **Test credentials are
  injected** via a `<<secret:NAME>>` token the runner substitutes at type-time (the model
  never sees the secret). Returns per-step verdicts + a **Browserbase live-view / replay
  URL** to watch it. Verified live end-to-end: logged into a real site (credential
  injected) and asserted the post-login page — **passed in ~38s**.
- **Watch the agent live — async runs + embedded live view + parallel suites** — a UI
  run no longer blocks: `startUiRun` creates the Browserbase session, returns a runId +
  live-view URL immediately, and drives the agent in the background (Next `after()`),
  streaming each step into the `test_run` row. The Test Cases page **embeds the live
  browser** (Browserbase live view in an iframe) while the run is in flight, streams the
  steps as they happen, then swaps to the **Session replay** link on completion —
  "load the app, watch the agent test it." A **▶ Run UI &lt;suite&gt; suite** button
  launches the suite's UI cases **in parallel** (capped for Browserbase concurrency),
  each with its own live tile. New `test_run` columns: `live_view_url`, `session_id`.
  Verified live in-app: the embedded browser drove a real login and the run finished
  **passed** with streamed steps + replay link.
- **Test Cases (AI test-case corpus + coverage)** — the story-to-tests link, a
  first-class artifact like the Playbook/TDD (`/projects/[id]/tests`, card below
  Epics). AI-generates comprehensive cases across **happy path, edge, negative, API,
  UI, performance, security, accessibility**, each with Gherkin (Given/When/Then)
  steps, expected result, priority, linked story, and **suite tags** (smoke / sanity
  / regression / e2e) — one corpus, selected by tag rather than duplicated per
  run-type. Generated **per epic and assembled** (project-level), or per epic / per
  story incrementally; grounded in the stories' acceptance criteria + the TDD +
  playbook. Normalized `test_case` rows (not a blob) so cases carry per-case
  draft/approved status, drive a **coverage view** (which stories have cases), and
  later feed the testing engine (their Gherkin = the `.feature` files). Versioned,
  editable, multi-approver approval, out-of-date on story/TDD/playbook change,
  groundedness, model picker, generation log, token/cost telemetry
  (`kind = testcases`), and **Word/PDF export** (colored-header tables per category).
  New tables: `test_plan`, `test_plan_approver`, `test_case`. Verified live: a real
  epic generated 14 cases across all 8 categories and all 4 suites, 100% grounded and
  compliance-aware, on Sonnet.
- **Technical Design Document (TDD)** — a first-class AI artifact, the technical
  counterpart to the product playbook, with the same lifecycle. One per project
  (`/projects/[id]/tdd`, card on the project page below Design → code): AI-generated
  and grounded in the **playbook** (lineage: `sourcePlaybookId`/version) plus features,
  compliance, and knowledge. Structured sections — overview, goals/non-goals,
  architecture, components, data model, APIs, key flows, technology choices, security &
  privacy, scalability, observability, risks & tradeoffs, testing strategy, rollout
  plan, open questions — a mix of prose and editable tables. Versioned, editable,
  **multi-approver** approval (all must approve; approvals carried forward on
  regenerate), goes **out of date** when the playbook or features change, with a
  groundedness score, model picker, per-version generation log, and token/cost
  telemetry (`kind = techdoc`), and **Word/PDF export** (bordered, colored-header
  tables + approval status, same as the playbook). New tables: `tech_doc`,
  `tech_doc_approver`. Verified live: 100% grounded, compliance-aware (GDPR/HIPAA)
  generation from the playbook, and valid PDF/DOCX export.
- **Design → code (Figma in the project)** — a new per-project workspace
  (`/projects/[id]/figma`, card on the project page): paste a Figma frame/component
  link and generate clean code in a chosen frontend language, following house
  standards. Ports the `figma-to-code` core into the web app (`lib/figma/*`): parse
  the link → Figma REST fetch → normalize to a framework-agnostic **design IR**
  (auto-layout → row/column, resolved colors, text, radius, strokes, component
  instances, Figma styles resolved as tokens) → build a codegen brief (IR + target
  profile + Aurume token/component map + house standards) → generate via the org's
  configured LLM (`generateStructured`, model picker, cost/token telemetry recorded
  in `ai_generation` as `kind = figma_code`). 12 targets: react-tailwind,
  html-tailwind, html-css, vue-tailwind, svelte, react-native, swiftui, flutter,
  angular, qwik, solid, compose. New **Figma connector** (encrypted personal access
  token) supplies the Figma auth; generated files are shown with copy/download plus
  the referenced tokens and warnings.

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
