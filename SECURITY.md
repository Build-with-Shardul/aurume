# Security Policy

Aurume is intended for enterprise delivery teams, so security is a first-class
concern — especially around credentials and untrusted input. We take reports
seriously and will work with you in good faith.

## Reporting a vulnerability

**Do not open a public issue for security vulnerabilities.**

Report privately by either:

- Using GitHub's **[Report a vulnerability]** button (Security → Advisories) on the
  affected repository, or
- Emailing **security@buildwithshardul.com** with details and reproduction steps.

Please include: the affected repo and version, a description, reproduction steps or
a proof of concept, and the impact you foresee. We aim to acknowledge within
**72 hours** and to agree a disclosure timeline with you. We will credit reporters
who wish to be named once a fix is released.

## Scope and design commitments

These are the security properties Aurume is being built to uphold; reports that
show any of them broken are especially valuable:

- **Credentials never enter an LLM context window.** The QA agent operates on
  `{{credential:...}}` placeholders substituted at the browser-driver layer, below
  the model. Real credentials must not appear in prompts, traces, logs, or
  screenshots.
- **Test/staging only for the browser agent.** Production URLs are hard-blocked.
- **Untrusted input is data, not instructions.** User-uploaded notes and retrieved
  content must never trigger tool calls or be treated as instructions (prompt-injection
  defence).
- **Bring-your-own-key and self-hostable.** Provider keys are the user's; a fully
  self-hosted deployment (including local models via Ollama) must be possible so no
  customer data need leave their environment.
- **Secrets at rest** are envelope-encrypted with per-project keys; secrets are
  scoped, revocable, and expiring.

## Supported versions

Aurume is pre-1.0. Security fixes are applied to the latest release on `main`. Once
we tag stable releases, this section will list supported version ranges.
