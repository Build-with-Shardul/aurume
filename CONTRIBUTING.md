# Contributing to Aurume

Thanks for your interest. Aurume is early and built in the open. Contributions,
issues, and design feedback are all welcome.

## The one hard requirement: the CLA

Before your first pull request can be merged, you must agree to the
[Contributor License Agreement](./CLA.md). This is automated — a bot comments on
your first PR with a link to sign, and records your agreement against your GitHub
account. You keep the copyright to your work; the CLA grants the project a licence
broad enough to keep Aurume open source while allowing a future commercial edition.
See [CLA.md](./CLA.md) for the details.

## How Aurume is structured

Aurume is not one repository. The AI capabilities ship first as independent,
documented, benchmarked repositories, and the platform assembles them later. See
[docs/PROJECT_PLAN.md](./docs/PROJECT_PLAN.md) for the full plan and the repo
sequence. This repo (`aurume`) is the hub: the roadmap, the governance, and
eventually the platform shell.

Each component repo carries its own `README`, `LICENSE`, tests, CI, and a
**Product Decisions** section explaining *why* (chunking, model choice, groundedness
targets, cost per generation). That "why" is as important as the code.

## Ways to contribute

- **Discuss a design decision** — open an issue. The open questions (O-05 … O-13 in
  the plan) are the highest-leverage places to help.
- **Fix or improve a component repo** — bugs, docs, tests, benchmarks.
- **Report a security issue** — privately, per [SECURITY.md](./SECURITY.md). Do not
  open a public issue for vulnerabilities.

## Development conventions

- **AI services** are Python + FastAPI. Format/lint with `ruff`; test with `pytest`.
- **The product shell** is TypeScript.
- Every LLM call is provider-abstracted (OpenAI / Anthropic / Ollama) and
  bring-your-own-key. Never hardcode a provider.
- **Never** commit secrets, API keys, or `.env` files. Each repo ships an
  `.env.example`.
- Emit structured telemetry (tokens, cost, latency) from every generation call —
  this is a project principle, not an afterthought.

## Pull request flow

1. Open an issue first for anything non-trivial, so the approach can be agreed.
2. Fork, branch, and keep PRs focused — one concern per PR.
3. Include tests and update docs/benchmarks where relevant.
4. Sign the CLA when the bot prompts you.
5. CI must pass (lint + tests) before review.

## Code of Conduct

Participation is governed by our [Code of Conduct](./CODE_OF_CONDUCT.md).
