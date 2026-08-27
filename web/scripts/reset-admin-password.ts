// Local dev utility: reset a user's password directly in the DB (no email flow needed).
// Usage:  NEW_PASSWORD='your-new-pw' [RESET_EMAIL=you@example.com] pnpm dlx tsx scripts/reset-admin-password.ts
// It hashes with Better Auth's own hasher, so the result works with normal sign-in.
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

// Load .env.local (web/.env.local) without extra flags.
try {
  const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch { /* env may already be set */ }

async function main() {
  const email = process.env.RESET_EMAIL || process.env.SUPER_ADMIN_EMAIL;
  const newPassword = process.env.NEW_PASSWORD;
  if (!email) { console.error("Set RESET_EMAIL (or SUPER_ADMIN_EMAIL)."); process.exit(1); }
  if (!newPassword) { console.error("Set NEW_PASSWORD."); process.exit(1); }

  const { and, eq } = await import("drizzle-orm");
  const { db } = await import("../src/lib/db");
  const { user, account } = await import("../src/lib/db/schema");
  const { auth } = await import("../src/lib/auth");

  const u = (await db.select().from(user).where(eq(user.email, email)).limit(1))[0];
  if (!u) { console.error(`No user with email ${email}.`); process.exit(1); }

  const ctx = await auth.$context;
  const hashed = await ctx.password.hash(newPassword);

  const existing = (
    await db.select().from(account).where(and(eq(account.userId, u.id), eq(account.providerId, "credential"))).limit(1)
  )[0];

  if (existing) {
    await db.update(account).set({ password: hashed, updatedAt: new Date() }).where(eq(account.id, existing.id));
    console.log(`✓ Password reset for ${email}.`);
  } else {
    await db.insert(account).values({
      id: randomUUID(), accountId: u.id, providerId: "credential", userId: u.id,
      password: hashed, createdAt: new Date(), updatedAt: new Date(),
    });
    console.log(`✓ Credential created + password set for ${email}.`);
  }
  process.exit(0);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
