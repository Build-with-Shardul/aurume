/**
 * Capability-based RBAC (ADR 0001).
 *
 * Features declare the permission they need (`resource.action`); roles are sets of those
 * permissions. This is the whole point of building RBAC first: every feature is born gated.
 *
 * These are the ORG-scoped permission roles. Disciplines (job titles) are a separate,
 * descriptive field — they do not grant permissions. Project-scoped overrides come later.
 */
import { createAccessControl } from "better-auth/plugins/access";
import {
  defaultStatements,
  adminAc,
  memberAc,
  ownerAc,
} from "better-auth/plugins/organization/access";

// Resources and the actions allowed on them. `defaultStatements` brings the organization
// plugin's own resources (organization, member, invitation, team); we add Aurume's.
export const statement = {
  ...defaultStatements,
  project: ["create", "manage", "read"],
  feature: ["create", "edit"],
  artifact: ["generate"], // the AI steps: playbook, stories, tests
  gate: ["approve"], // stakeholder approval gates
  board: ["write"], // assign / move work
  rates: ["view", "manage"], // compensation-adjacent — Finance only (D-15)
} as const;

export const ac = createAccessControl(statement);

// --- Roles ---
// Org-management roles (owner/admin/member) keep their default org permissions and gain
// Aurume capabilities on top. The delivery roles are the small fixed set from the ADR.

export const owner = ac.newRole({
  ...ownerAc.statements,
  project: ["create", "manage", "read"],
  feature: ["create", "edit"],
  artifact: ["generate"],
  gate: ["approve"],
  board: ["write"],
  rates: ["view", "manage"],
});

export const admin = ac.newRole({
  ...adminAc.statements,
  project: ["create", "manage", "read"],
  feature: ["create", "edit"],
  artifact: ["generate"],
  gate: ["approve"],
  board: ["write"],
});

export const manager = ac.newRole({
  ...memberAc.statements,
  project: ["create", "manage", "read"],
  feature: ["create", "edit"],
  artifact: ["generate"],
  gate: ["approve"],
  board: ["write"],
});

export const contributor = ac.newRole({
  ...memberAc.statements,
  project: ["read"],
  feature: ["create", "edit"],
  artifact: ["generate"],
  board: ["write"],
});

export const stakeholder = ac.newRole({
  ...memberAc.statements,
  project: ["read"],
  gate: ["approve"],
});

export const finance = ac.newRole({
  ...memberAc.statements,
  project: ["read"],
  rates: ["view", "manage"],
});

export const viewer = ac.newRole({
  ...memberAc.statements,
  project: ["read"],
});

// The full role set handed to the organization plugin. Keys are the role names stored on
// memberships and invitations.
export const roles = { owner, admin, manager, contributor, stakeholder, finance, viewer };

// Delivery roles a Super Admin / Org Admin can assign when inviting (owner is reserved for
// the creator). Order is display order.
export const ASSIGNABLE_ROLES = [
  "admin",
  "manager",
  "contributor",
  "stakeholder",
  "finance",
  "viewer",
] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];
