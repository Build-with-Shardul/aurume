import { readFileSync } from "node:fs";
try {
  const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {}

async function main() {
  const { eq, and } = await import("drizzle-orm");
  const { db } = await import("../src/lib/db");
  const { user, account } = await import("../src/lib/db/schema");
  const { auth } = await import("../src/lib/auth");
  const ctx = await auth.$context;

  // 1) pure hasher round-trip
  const h = await ctx.password.hash("RT-check-123");
  const ok = await ctx.password.verify({ hash: h, password: "RT-check-123" });
  console.log("hasher round-trip:", ok, "| hash prefix:", h.slice(0, 24));

  // 2) set admin to a known value, read back, verify
  const email = "admin@buildwithshardul.com";
  const u = (await db.select().from(user).where(eq(user.email, email)).limit(1))[0];
  const creds = await db.select().from(account).where(and(eq(account.userId, u.id), eq(account.providerId, "credential")));
  console.log("admin credential rows:", creds.length);
  const newHash = await ctx.password.hash("Aurume-Test-99");
  await db.update(account).set({ password: newHash, updatedAt: new Date() }).where(and(eq(account.userId, u.id), eq(account.providerId, "credential")));
  const back = (await db.select().from(account).where(and(eq(account.userId, u.id), eq(account.providerId, "credential"))).limit(1))[0];
  const backOk = await ctx.password.verify({ hash: back.password!, password: "Aurume-Test-99" });
  console.log("admin read-back verify:", backOk);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
