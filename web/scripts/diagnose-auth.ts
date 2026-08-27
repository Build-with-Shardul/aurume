// Local dev diagnostic: list users and check whether a password verifies.
// Usage: [CHECK_PASSWORD='pw'] pnpm dlx tsx scripts/diagnose-auth.ts
import { readFileSync } from "node:fs";
try {
  const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch { /* ignore */ }

async function main() {
  const { eq, and } = await import("drizzle-orm");
  const { db } = await import("../src/lib/db");
  const { user, account } = await import("../src/lib/db/schema");
  const { auth } = await import("../src/lib/auth");
  const ctx = await auth.$context;

  const users = await db.select().from(user);
  console.log(`Users (${users.length}):`);
  const check = process.env.CHECK_PASSWORD;
  for (const u of users) {
    const cred = (await db.select().from(account).where(and(eq(account.userId, u.id), eq(account.providerId, "credential"))).limit(1))[0];
    let verdict = cred?.password ? "has credential" : "NO credential row";
    if (check && cred?.password) {
      try {
        const ok = await ctx.password.verify({ hash: cred.password, password: check });
        verdict += ok ? " · CHECK_PASSWORD ✓ matches" : " · CHECK_PASSWORD ✗ no match";
      } catch (e) {
        verdict += ` · verify error: ${e instanceof Error ? e.message : e}`;
      }
    }
    console.log(`  - ${JSON.stringify(u.email)}  role=${u.role ?? "-"}  verified=${u.emailVerified}  [${verdict}]`);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
