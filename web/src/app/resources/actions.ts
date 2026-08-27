"use server";

import { and, eq } from "drizzle-orm";
import { getActiveMembership, canManageOrg } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { leave, member } from "@/lib/db/schema";

export async function addLeave(userId: string, startDate: string, endDate: string, type: string, note: string) {
  const m = await getActiveMembership();
  if (!m?.orgId || !canManageOrg(m.role)) return { error: "Not allowed." };
  const isMember = (await db.select({ id: member.id }).from(member).where(and(eq(member.organizationId, m.orgId), eq(member.userId, userId))).limit(1))[0];
  if (!isMember) return { error: "Not a member of this workspace." };
  if (!startDate || !endDate) return { error: "Start and end dates are required." };
  if (endDate < startDate) return { error: "End can't be before start." };
  await db.insert(leave).values({ id: crypto.randomUUID(), organizationId: m.orgId, userId, startDate, endDate, type: type || "leave", note: note?.trim() || null, createdBy: m.userId });
  return { ok: true };
}

export async function deleteLeave(leaveId: string) {
  const m = await getActiveMembership();
  if (!m?.orgId || !canManageOrg(m.role)) return { error: "Not allowed." };
  await db.delete(leave).where(and(eq(leave.id, leaveId), eq(leave.organizationId, m.orgId)));
  return { ok: true };
}
