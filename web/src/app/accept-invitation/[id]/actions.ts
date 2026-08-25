"use server";

import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { invitation, member } from "@/lib/db/schema";

/**
 * After an invitation is accepted, copy its discipline onto the new member row.
 * (Better Auth carries the role across on accept; discipline is our own field.)
 */
export async function applyInvitationDiscipline(invitationId: string) {
  const session = await getSession();
  if (!session) return;

  const inv = (
    await db
      .select({ discipline: invitation.discipline, orgId: invitation.organizationId })
      .from(invitation)
      .where(eq(invitation.id, invitationId))
      .limit(1)
  )[0];

  if (!inv?.discipline) return;

  await db
    .update(member)
    .set({ discipline: inv.discipline })
    .where(and(eq(member.userId, session.user.id), eq(member.organizationId, inv.orgId)));
}
