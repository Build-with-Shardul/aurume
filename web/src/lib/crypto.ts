import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

// Connector secrets (API keys) are encrypted at rest with AES-256-GCM. The key is derived
// from BETTER_AUTH_SECRET so self-hosters don't need another env var; a dedicated
// AURUME_ENCRYPTION_KEY can be introduced later without changing callers.
function key(): Buffer {
  const secret = process.env.AURUME_ENCRYPTION_KEY || process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("BETTER_AUTH_SECRET (or AURUME_ENCRYPTION_KEY) is required to encrypt connector secrets");
  return createHash("sha256").update(`${secret}:aurume-connector-v1`).digest();
}

/** Returns "iv.tag.ciphertext", all base64. */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(".");
}

export function decryptSecret(payload: string): string {
  const [ivB, tagB, encB] = payload.split(".");
  if (!ivB || !tagB || !encB) throw new Error("malformed encrypted secret");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB, "base64"));
  decipher.setAuthTag(Buffer.from(tagB, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(encB, "base64")), decipher.final()]).toString("utf8");
}

/** For UI display: show only the last few chars of a secret. */
export function maskSecret(plain: string): string {
  if (!plain) return "";
  const tail = plain.slice(-4);
  return `••••••••${tail}`;
}
