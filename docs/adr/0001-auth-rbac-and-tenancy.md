# ADR 0001 — Authentication, RBAC, and Multi-Org Tenancy

- **Status:** Accepted
- **Date:** 2026-08-25
- **Deciders:** Shardul Nerlekar
- **Context:** This is the first shell component. Aurume's approval gates, resource
  rates (D-15), and per-project teams all require identity and a permission model to
  exist *before* any feature ships (O-10). We build the permission spine first, then
  every feature declares the permission it needs — capability-based RBAC — so access
  is enforced from day one instead of retrofitted (which leaks).

## Decision

### 1. Multi-org tenancy, three permission scopes

One running instance hosts many isolated **organizations**. Access is governed at
three scopes, stacked:

```
INSTANCE   → Super Admin (platform operator; you)   — manage everything, all orgs
   └─ ORG  → Owner · Admin · Member                 — manage the org, invite people, create projects
        └─ PROJECT → Manager · Contributor · Stakeholder · Finance · Viewer  — do the work
```

- **Instance scope** — a global **Super Admin** (the operator who deployed the
  instance). God-mode; user management across orgs; instance settings.
- **Org scope** — every org has an **Owner** (creator), plus **Admins** and
  **Members**. Owners/Admins invite people into the org and create projects.
- **Project scope** — where the agile permission roles live, because agile roles are
  inherently per-project (a person is a Stakeholder on Project X, nothing on Y).

Data is isolated per org: every org-owned row carries `org_id`, and all queries are
org-scoped. No cross-org read without instance Super Admin.

### 2. Discipline (title) is separate from Permission Role

Two independent fields on a project membership:

- **Discipline** — descriptive job title, a *growable* enum. Drives resourcing and
  capacity later (D-16); grants no permissions by itself.
  `product_manager · project_manager · scrum_master · qa_manual · qa_automation ·
   frontend_developer · backend_developer · ux_designer · engineering_manager ·
   engineering_director · stakeholder · business_analyst · devops · other`
- **Permission Role** — a *small fixed set* that governs capabilities.

Inviting someone = pick a **discipline** + a **permission role**. The UI can
auto-suggest a role from the title (e.g. Engineering Director → Manager), but they are
stored separately. This gives a rich title list *and* a clean, enforceable matrix.

### 3. Permission roles → capabilities (the matrix)

Capabilities are `resource.action` strings; features check them. Starter matrix
(extends as features land):

| Capability | Super Admin | Org Owner/Admin | Manager | Contributor | Stakeholder | Finance | Viewer |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| `org.manage` (settings, billing) | ✅ | ✅ | – | – | – | – | – |
| `member.invite` / `member.manage` | ✅ | ✅ | – | – | – | – | – |
| `project.create` | ✅ | ✅ | ✅ | – | – | – | – |
| `project.manage` (members, config) | ✅ | ✅ | ✅ | – | – | – | – |
| `feature.create` / `feature.edit` | ✅ | ✅ | ✅ | ✅ | – | – | – |
| `artifact.generate` (AI steps) | ✅ | ✅ | ✅ | ✅ | – | – | – |
| `gate.approve` (approval gates) | ✅ | ✅ | ✅ | – | ✅ | – | – |
| `board.write` (assign, move) | ✅ | ✅ | ✅ | ✅ | – | – | – |
| `rates.view` / `rates.manage` (D-15) | ✅ | ✅* | – | – | – | ✅ | – |
| `read` (everything in scope) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

\* Org Owner sees rates; a plain Admin may not, if Finance is kept separate. Finance is
a role *or* an attachable capability — starting as a role, revisit if it's too coarse.

**Key rule (D-15):** `rates.view` is restricted. Everyone else sees role-level rate
bands and aggregate cost, never individual rates.

### 4. Invitation → set-password flow

1. An Org Owner/Admin invites `email` + `permission_role` (+ optional project +
   discipline). An `invitation` row is created with a single-use, expiring token.
2. Resend emails the invite link. (BYO key; SMTP fallback for self-hosters.)
3. The invitee opens the link, sets a password, and their `user` + `org_membership`
   (and `project_membership` if scoped) are created/activated.
4. Token is consumed; expired/again-used tokens are rejected. Re-invite reissues.

Existing users invited to a new org skip password setup and just gain membership.

### 5. Stack

- **Next.js** (full-stack TypeScript — the shell app; D-07) · **PostgreSQL** (D-08) ·
  **Drizzle** ORM.
- **Better Auth** — email/password + the **organization**, **admin**, and
  **access-control** plugins give us orgs, memberships, invitations, a Super Admin,
  and the capability matrix natively, with a clean path to **SSO / SAML / SCIM** later
  (the enterprise buyer needs it). Chosen over hand-rolled auth (throwaway) and
  Keycloak (heavy; against one-command self-host).
- **Resend** for transactional email.
- Lives in the **`aurume`** repo (the platform repo); the landing page stays in
  `site/`, served separately by GitHub Pages.

## Data model (entities)

- **user** — global identity (id, email, name, hashed credential, timestamps).
- **organization** — a tenant (id, name, slug, created_by).
- **org_membership** — (user_id, org_id, org_role ∈ owner|admin|member, status).
- **project** — (id, org_id, name, …). *All project data hangs off org_id.*
- **project_membership** — (user_id, project_id, permission_role, discipline).
- **invitation** — (id, org_id, email, permission_role, project_id?, discipline?,
  token_hash, expires_at, status, invited_by).
- **role/permission** — capability matrix defined in code (Better Auth access-control
  statements), not free-form DB rows, so it's versioned and testable.

Immutable-append audit rows for membership/role changes and approvals come with the
artifact model (O-05, a later ADR); this ADR establishes identity + access only.

## Consequences

- **Good:** every future feature is born gated; rates never leak (D-15 satisfied
  before resources ship); approval gates have real identity behind them; SSO is a
  plugin away.
- **Cost:** multi-org isolation must be enforced on every query (org_id scoping) and
  tested — a security-review focus. Three scopes add some conceptual overhead vs a
  single-workspace MVP.
- **Deferred:** SSO/SAML/SCIM, project-level fine-grained overrides, custom roles per
  org. The fixed role set ships first; custom roles only if users demand them.
