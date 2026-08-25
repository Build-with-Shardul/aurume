# Project Plan — Aurume

**Status:** Planning. Building Phase 1 AI repos, starting with `playbook-drafter`.
**Name status:** Resolved. Repo `github.com/Build-with-Shardul/aurume`; web home `aurume.dev`, linked from Build With Shardul (see O-04).
**Author:** Shardul
**Purpose of this document:** Lock the decisions that are expensive to reverse, define Phase 1 scope, and map the build onto the AI PM learning roadmap.

Timeline is expressed in **weeks of effort**, not calendar dates.

---

## 1. What this is

An open-source platform that carries a product feature from **idea to delivery** as a chain of connected, approved artifacts — where each AI generation step is grounded in the approved artifact above it.

The differentiator is **not** any individual AI feature. The differentiator is **lineage**: every story can be traced back to the playbook section it came from, the feature that spawned it, and the stakeholder who approved it, with versions.

**One-line positioning:** the planning and traceability layer that sits *above* your execution tool — not a Jira replacement.

## 2. Goals

| Goal | Implication |
|---|---|
| Learn LLM/RAG/agents by implementation | The AI layer must be built deliberately, benchmarked, documented |
| Portfolio strength on GitHub | Finished, documented, tested repos beat one sprawling unfinished product |

Tension: ~85–90% conventional CRUD, 10–15% AI. Resolution: extract the AI layer as standalone repos first (Section 7). The SaaS becomes the shell that assembles them.

## 3. Target user

Enterprise delivery teams, IT services firms, consultancies — gated, stakeholder-heavy, milestone-driven delivery (not continuous agile). They already live in Jira; forcing migration kills tools like this (see D-04).
> Open question O-01: audience inferred, not stated. Confirm before building the shell.

## 4. The artifact chain

Project → Resources + Working Calendar → Team → Features → Product Playbook (AI) → [APPROVAL] → Design (Figma link) → [APPROVAL] → Epics + Stories (AI) → Test Cases + Traceability (AI) → Sprint Plan (AI draft, human-sequenced) → HTML/CSS Scaffold (deferred) → Executable Tests (deferred) → Test Results → Feature Delivered → traceability matrix (requirement → test → live pass/fail).

Every artifact stores its **parent ID** and the **version** it was generated from. Core data-model requirement; cannot be retrofitted (O-05).

## 5. Phase 1 scope

In: project creation (budget, phase timeline); team (business/engineering roles); resources (discipline, bandwidth, rate); working calendar (regional holidays, leave, hours, allocation); points→hours factor; calendar-aware timeline view; budget burn-down (allocated/forecast/actual, no timesheets); feature definition; AI-drafted playbook from one default template; stakeholder approval workflow + audit trail; Figma link attach; AI epics+stories grounded in playbook+notes; AI test cases with traceability; simple board, manual sprint assignment.

Deferred: AI Figma generation (impossible, D-03); Slack/Zoom integration; AI sprint sequencing (D-05); custom templates; Jira bidirectional sync (Phase 2); HTML/CSS scaffold (Phase 2); agentic frontend testing (Phase 2/3); autonomous agents (never); dependency-aware scheduling/critical path (Phase 2, D-17); timesheets (Phase 2, D-14); multi-currency (Phase 2).

Estimated effort: 16–20 weeks part-time for Phase 1 shell, *after* the AI repos exist.

## 6. Decisions

### Locked
- **D-01** License: AGPLv3 + hosted cloud offering (Cal.com/Plausible model).
- **D-02** CLA required from day one, before the first external PR.
- **D-03** Design is uploaded, not generated (Figma REST API is read-only for file contents).
- **D-04** Own the data, sync to Jira. Stories canonical in our DB; Jira is a sync target. Output layer = swappable adapter.
- **D-05** Separate story generation from sprint sequencing. AI generates backlog + flags dependencies, proposes draft sprint skeleton with visible reasoning; humans sequence. Velocity data grounds later suggestions.
- **D-06** Agency in exactly one place. The chain is a stateful workflow with human-in-the-loop gates, not an autonomous agent.
- **D-07** Python/FastAPI for AI services; TypeScript for the product shell. Shell calls AI services over HTTP.
- **D-08** Postgres + pgvector. No separate vector DB. One-command self-host.
- **D-09** Provider abstraction for all LLM calls (OpenAI, Anthropic, Ollama), user brings own key. Non-negotiable.
- **D-10** The QA agent authors tests; it does not run them. Agent emits a deterministic Playwright script; CI runs it; agent re-engages only on failure (self-healing).
- **D-11** Credentials never enter the LLM context window. `{{credential:test_user}}` placeholders substituted at the browser-driver layer. Test/staging only; envelope encryption; scoped/revocable; redaction over traces.
- **D-12** Estimation unit configurable; points never hardcoded to hours. Points or hours per project; if points, a points→hours factor; system derives observed factor after 2–3 sprints.
- **D-13** Three budget numbers, always separated: Allocated / Forecast (open×rates) / Actual (completed×rates). Forecast-vs-actual variance is the key output.
- **D-14** No timesheets in Phase 1. Actual cost derives from completed story estimates × assignee rate.
- **D-15** Rates are role-restricted data. Full per-person rates visible to finance/owner only; others see role bands + aggregate. Makes O-10 a Phase 1 blocker.
- **D-16** Working calendar is first-class and regional. Holiday sets per region; per-person leave; working days/week; hours/day; allocation %. Available hours = (working days − regional holidays − leave) × hours/day × allocation.
- **D-17** Scheduling is deterministic. No LLM in the scheduler — topological sort, capacity constraints, calendar-aware dates, critical path. Phase 1: calendar-aware timeline view only. Phase 2: dependency-aware scheduling + resource leveling + critical path. One currency per project.

### Open
- **O-01** Confirm target user.
- **O-02** Realistic weekly hours (everything scales off this).
- **O-03** Access to real delivery teams for validation.
- **O-04** RESOLVED: name Aurume. Repo `Build-with-Shardul/aurume`; web home `aurume.dev` (301 to the repo until a real site). Link both directions (Build With Shardul ↔ Aurume README). AGPLv3.

## 7. Repo sequence

Each AI step is a legitimate standalone OSS project. Build separately, then assemble.

| # | Repo | What | Roadmap stage | Effort |
|---|---|---|---|---|
| 1 | `playbook-drafter` | Template-driven structured generation | Stage 1 — LLM fundamentals, structured output | 2 wks |
| 2 | `spec-to-stories` | Grounded generation with citations to source | Stages 4–5 — RAG | 4 wks |
| 3 | `story-to-tests` | Structured output + traceability matrix | Stage 1 + 6 | 3 wks |
| 4 | `delivery-evals` | Groundedness/faithfulness harness across 1–3 | Stage 6 — evaluation | 3 wks |
| 5 | `delivery-graph` | LangGraph orchestration, gates, interrupts, resume | Stage 7 — agents | 4 wks |
| 6 | *the platform* (`aurume`) | The shell that assembles the above | Stage 9 — capstone | 16–20 wks |
| 7 | `qa-agent` | Browser agent authoring Playwright tests from stories | Stage 7 + 8 | 5–6 wks |
| 8 | `llm-observability` | Traces, cost, latency, quality over real runs | Stage 8 | 3–4 wks |

> Instrument from repo 1, not repo 8. Emit structured telemetry from the first generation call. Repo 8 is largely a byproduct of running 1–5 and 7.

Each of 1–5 and 7 ships with: README + a Product Decisions section (why this chunk size, groundedness score, cost/generation); benchmarks with real numbers; tests, CI, Docker Compose, `.env.example`; a live demo where feasible.

## 8. Agentic architecture

The chain is a workflow, not an agent — a better portfolio story. Build on LangGraph: durable state, interrupts for approval + resume, checkpointing/retry, rollback when a stakeholder rejects step 4 after step 5 ran. Real agency lives in ONE node — story generation (tool use + reflection: query playbook, search notes, read Figma tree, retrieve similar stories → draft → self-critique → revise). Hard constraints: an agent never passes an approval gate; never writes to the board autonomously. Agents propose, humans commit.

## 9. HTML/CSS scaffold (Phase 2)

Usable starting point, not production/pixel-perfect. Real difficulty is Figma extraction (freeform = absolutely positioned = maps to nothing; detect & warn). Advantage over Anima/Locofy: we see design + playbook + stories + acceptance criteria → semantic scaffolding (sections named after features; TODO comments linking story IDs + AC; `data-testid` matching generated tests). Order: tokens→CSS vars (start here), auto-layout→semantic flexbox (the deliverable), pixel fidelity (skip). Feed the model structured node JSON, not screenshots; geometry deterministic in code.

## 10. Agentic frontend testing (Phase 2/3)

Full agency warranted (DOM unknown in advance). Authoring (agentic) emits an annotated Playwright spec; Execution (deterministic) runs in CI; on failure the agent classifies regression vs. moved selector. Closes the chain: test results write back to the story → live traceability matrix. Meta-eval: fixture app with seeded bugs + measured detection rate (build in `delivery-evals`). Metrics: detection rate, false pass/fail, cost per authored test, authoring latency, selector-healing success. Constraints: staging-only (URL-enforced); creds per D-11; human review before CI; agent never modifies app code.

## 11. Measurement and credibility layer

Evidence, not monitoring. Every number needs methodology + reproduction path. No "accuracy" for generative tasks; use groundedness/faithfulness, requirement coverage, schema-validity rate, **human acceptance rate** (instrument from day one), detection rate vs. seeded bugs, false-pass rate. Report cost in business units (cost per story/test/feature), P50/P95 latency, cache hit rate — tokens in the detail view only. Token-optimization techniques, each with before/after on cost AND a quality metric: prompt caching (playbook prefix — likely biggest win), model cascade, retrieve-don't-stuff, pre-compression, structured output. Publish experiments (hypothesis→method→results→decision→rationale) and **failures**. No self-invented composite scores. Reproducibility: datasets committed, methodology per metric, one command to reproduce, benchmarks re-run in CI.

## 12. Unresolved design questions

- **O-05** (critical path) Data model asserted, never specified. Lineage = DAG with typed edges (`derived_from`, `approved_by`, `verified_by`); immutable-append artifacts + history; approvals attach to a specific *version*. Must also carry resources/disciplines/rates, rate history, allocation %, regional calendars, leave, assignments, dual-unit estimates, three budget figures. Solve rate history + artifact versioning together.
- **O-06** Change propagation undefined (hardest problem). Approved playbook edited after stories generated → stale/diff/fork? Without an answer, traceability is decorative.
- **O-07** Eval bootstrapping. Groundedness needs ground truth; no real corpus/users yet. Hand-build ~20 golden playbook/story pairs, or public sources, or synthesize+verify. Prerequisite for Section 11.
- **O-08** Prompt injection unaddressed. Uploaded notes → model context → agent with tools. Treat uploaded content as untrusted data; never let retrieved content trigger tool calls.
- **O-09** Data residency/privacy. State: self-host with Ollama for isolation; no training on customer data; what's retained in traces. Procurement blocker.
- **O-10** (Phase 1 blocker) Auth/tenancy/RBAC absent. Approval needs identity; rates need role-scoped visibility (D-15). Permission model before resources ship.
- **O-11** No definition of done, no kill criteria. Set thresholds + abandonment condition while objective.
- **O-12** API spend budget. Monthly cap + cheap-model default for dev loops.
- **O-13** Website integration: cached server-side GitHub endpoint (token never in browser), project page per repo; stats auto-pulled; list only repos that exist.

## 13. Risks (high-severity)

Scope creep (Section 5 boundaries are the contract); building CRUD instead of learning AI (Section 7 — AI repos first); credential handling fails security review (D-11); flaky agentic tests (D-10); data model can't support lineage, found late (O-05); no ground truth → no credibility layer (O-07).

## 14. Portfolio checklist

README with architecture diagram + demo GIF above the fold; ADRs (the *why*); real tests on generation/grounding; CI; **a live demo anyone can click**; CONTRIBUTING/CODE_OF_CONDUCT/SECURITY/LICENSE/.env.example; Docker Compose one-command + seeded data; benchmarks with real numbers; good-first-issue labels. The hire signal: groundedness score + cost per story + where it fails + why a human gate was added there — numbers and failure analysis, not autonomy.

## 15. Immediate next steps

1. Answer O-01, O-02.
2. Resolve O-05 (data model) on paper before shell code.
3. Design the permission model (O-10) alongside it.
4. Solve O-07 (eval dataset bootstrapping).
5. Set up the CLA (D-02) before any repo goes public.
6. **Start `playbook-drafter`.** Smallest scope, teaches structured output, produces a real artifact — and does not depend on the above.
