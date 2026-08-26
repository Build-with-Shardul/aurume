<h1 align="center">Aurume</h1>

<p align="center">
  <strong>The planning and traceability layer that sits <em>above</em> your execution tool.</strong><br>
  Carry a product feature from idea to delivery as a chain of connected, approved
  artifacts — where every AI step is grounded in the approved artifact above it.
</p>

<p align="center">
  <a href="./LICENSE"><img alt="License: AGPL v3" src="https://img.shields.io/badge/License-AGPL_v3-blue.svg"></a>
  <img alt="Status: early" src="https://img.shields.io/badge/status-early%20development-orange">
</p>

---

## What Aurume is

Aurume is an open-source platform for product managers. It takes a feature from a
**Product Playbook**, through **stakeholder approval gates**, into **epics, stories,
and test cases**, and on to a **live traceability matrix** — requirement → test →
pass/fail.

The differentiator is **not** any single AI feature; every one of them exists
elsewhere. The differentiator is **lineage**. Every story can be traced back to the
playbook section it came from, the feature that spawned it, and the stakeholder who
approved it — with versions.

> ChatGPT can write a PRD. It cannot tell you which approved requirement it came
> from, who signed off, and what changed since. Aurume can.

It is built for **enterprise and gated delivery teams** — stakeholder-heavy,
milestone-driven work that Jira and Linear serve poorly. It does not replace your
execution tool; it sits above it and syncs.

## Why it's built this way

A few principles, decided up front (full rationale in
[docs/PROJECT_PLAN.md](./docs/PROJECT_PLAN.md)):

- **Agents propose, humans commit.** The chain is a stateful workflow with
  human-in-the-loop approval gates, not an autonomous agent. An agent never passes
  a gate.
- **Evidence over autonomy.** Every AI step is benchmarked and documented —
  groundedness, cost per generation, and where it fails — not demoed.
- **Provider-agnostic, bring-your-own-key.** OpenAI, Anthropic, or fully local via
  Ollama. Self-hostable in one command.
- **Deterministic where it should be.** Scheduling and cost math are arithmetic, not
  LLM guesses.

## Roadmap

The platform spine shipped first — workspace, roles, projects, and a knowledge base.
The AI capabilities land next as independent, documented, benchmarked repos the
platform assembles. Only shipped work is marked so — this table is the honest status.

| Component | What it does | Status |
|---|---|---|
| **`aurume`** (this repo) | Multi-org workspace, RBAC, projects, connectors, knowledge space | ✅ Live · [v0.1.0](https://github.com/Build-with-Shardul/aurume/releases/tag/v0.1.0) |
| `playbook-drafter` | Grounded, structured product-playbook generation | 🔜 Next |
| `spec-to-stories` | Grounded story generation with citations (RAG) | Planned |
| `story-to-tests` | Test cases + traceability matrix | Planned |
| `delivery-evals` | Groundedness / faithfulness evaluation harness | Planned |
| `delivery-graph` | Workflow orchestration, approval gates, resume | Planned |
| `qa-agent` | Browser agent that authors Playwright tests | Planned |
| `llm-observability` | Traces, cost, latency, quality over real runs | Planned |

The full plan — scope, locked decisions, and open design questions — lives in
[docs/PROJECT_PLAN.md](./docs/PROJECT_PLAN.md). For an honest inventory of what
isn't built yet (and the suggested build order), see [docs/GAPS.md](./docs/GAPS.md).

## License & contributing

Aurume is licensed under the **[GNU AGPLv3](./LICENSE)**. Contributions are welcome
under the [Contributor License Agreement](./CLA.md) — see
[CONTRIBUTING.md](./CONTRIBUTING.md). Please review the
[Code of Conduct](./CODE_OF_CONDUCT.md) and
[Security Policy](./SECURITY.md).

Copyright © 2026 Shardul Nerlekar.

---

<p align="center">
  Built by <a href="https://buildwithshardul.com">Shardul</a> — an AI Product Manager building in public.
</p>
