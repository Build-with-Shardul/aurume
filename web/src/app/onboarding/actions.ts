"use server";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { user, organization } from "@/lib/db/schema";
import { getSession } from "@/lib/auth-server";

/**
 * Persist the answers collected during onboarding. Role + intent describe the
 * person (stored on `user`); team size describes the workspace (`organization`).
 * Descriptive only — grants no permissions.
 */
export async function saveOnboarding(input: {
  role?: string;
  intent?: string;
  teamSize?: string;
  organizationId?: string;
}) {
  const session = await getSession();
  if (!session?.user?.id) return { error: "Not signed in" };

  await db
    .update(user)
    .set({ onboardingRole: input.role ?? null, onboardingIntent: input.intent ?? null })
    .where(eq(user.id, session.user.id));

  if (input.organizationId && input.teamSize) {
    await db
      .update(organization)
      .set({ teamSize: input.teamSize })
      .where(eq(organization.id, input.organizationId));
  }

  return { ok: true };
}
