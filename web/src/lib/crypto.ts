import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "crypto";

/**
 * Connector secrets are protected with **envelope encryption**:
 *
 *   plaintext --AES-256-GCM(DEK)--> ciphertext         (DEK = a random 32-byte data key, per secret)
 *   DEK       --AES-256-GCM(KEK)--> wrapped DEK         (KEK = a key-encryption key derived from an env secret)
 *
 * Only the small wrapped DEK is tied to the KEK, so:
 *   - Rotating BETTER_AUTH_SECRET never touches connectors, as long as a dedicated
 *     AURUME_ENCRYPTION_KEY is set (it takes precedence as the KEK material).
 *   - Rotating AURUME_ENCRYPTION_KEY only requires re-wrapping the DEKs (rewrapSecret),
 *     never re-encrypting the payloads. Keep the old value in AURUME_ENCRYPTION_KEY_RETIRED
 *     (comma-separated) until the re-wrap finishes.
 *
 * Stored format v2:  v2.<kid>.<wrapIv>.<wrapTag>.<wrappedDek>.<dataIv>.<dataTag>.<dataCt>  (base64 parts)
 * Legacy format v1:  <iv>.<tag>.<ciphertext>  (single derived key; still readable, upgraded on next write/rewrap)
 */

const KEK_LABEL = "aurume-kek-v1";
const LEGACY_LABEL = "aurume-connector-v1";

type Kek = { kid: string; key: Buffer };

function deriveKek(material: string): Kek {
  const key = createHash("sha256").update(`${material}:${KEK_LABEL}`).digest();
  const kid = createHash("sha256").update(key).update(":kid").digest("hex").slice(0, 12);
  return { kid, key };
}

/** KEK material used to WRAP new secrets: the dedicated key if present, else the auth secret. */
function primaryMaterial(): string {
  const m = process.env.AURUME_ENCRYPTION_KEY || process.env.BETTER_AUTH_SECRET;
  if (!m) throw new Error("AURUME_ENCRYPTION_KEY (or BETTER_AUTH_SECRET) is required to encrypt connector secrets");
  return m;
}

/** All KEK materials available for UNWRAPPING (primary + retired + auth secret), for rotation. */
function allMaterials(): string[] {
  const out: string[] = [];
  const add = (v?: string | null) => {
    if (v && v.trim() && !out.includes(v.trim())) out.push(v.trim());
  };
  add(process.env.AURUME_ENCRYPTION_KEY);
  for (const r of (process.env.AURUME_ENCRYPTION_KEY_RETIRED || "").split(",")) add(r);
  add(process.env.BETTER_AUTH_SECRET);
  return out;
}

function primaryKek(): Kek {
  return deriveKek(primaryMaterial());
}

function keyring(): Kek[] {
  return allMaterials().map(deriveKek);
}

function gcmEncrypt(key: Buffer, plain: Buffer): { iv: Buffer; tag: Buffer; ct: Buffer } {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plain), cipher.final()]);
  return { iv, tag: cipher.getAuthTag(), ct };
}

function gcmDecrypt(key: Buffer, iv: Buffer, tag: Buffer, ct: Buffer): Buffer {
  const d = createDecipheriv("aes-256-gcm", key, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]);
}

const b64 = (b: Buffer) => b.toString("base64");
const unb64 = (s: string) => Buffer.from(s, "base64");

/** Encrypt a plaintext secret into the v2 envelope format, wrapped under the primary KEK. */
export function encryptSecret(plain: string): string {
  const dek = randomBytes(32);
  const data = gcmEncrypt(dek, Buffer.from(plain, "utf8"));
  const kek = primaryKek();
  const wrap = gcmEncrypt(kek.key, dek);
  return [
    "v2",
    kek.kid,
    b64(wrap.iv), b64(wrap.tag), b64(wrap.ct),
    b64(data.iv), b64(data.tag), b64(data.ct),
  ].join(".");
}

/** Decrypt either a v2 envelope payload or a legacy v1 payload. */
export function decryptSecret(payload: string): string {
  if (payload.startsWith("v2.")) {
    const [, kid, wIv, wTag, wCt, dIv, dTag, dCt] = payload.split(".");
    if (!kid || !wIv || !wTag || !wCt || !dIv || !dTag || !dCt) throw new Error("malformed encrypted secret");
    const kek = keyring().find((k) => k.kid === kid);
    if (!kek) throw new Error("no encryption key available for this secret (kid mismatch — set AURUME_ENCRYPTION_KEY_RETIRED?)");
    const dek = gcmDecrypt(kek.key, unb64(wIv), unb64(wTag), unb64(wCt));
    return gcmDecrypt(dek, unb64(dIv), unb64(dTag), unb64(dCt)).toString("utf8");
  }
  // Legacy v1: iv.tag.ciphertext, single key derived directly from a material.
  const [ivB, tagB, encB] = payload.split(".");
  if (!ivB || !tagB || !encB) throw new Error("malformed encrypted secret");
  let lastErr: unknown;
  for (const material of allMaterials()) {
    const legacyKey = createHash("sha256").update(`${material}:${LEGACY_LABEL}`).digest();
    try {
      return gcmDecrypt(legacyKey, unb64(ivB), unb64(tagB), unb64(encB)).toString("utf8");
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error("could not decrypt legacy secret with any available key", { cause: lastErr });
}

/**
 * Re-wrap a stored secret under the CURRENT primary KEK. For v2 payloads this only
 * unwraps + re-wraps the small DEK (the data ciphertext is untouched); legacy payloads
 * are upgraded to v2. Returns null when nothing needs to change (already wrapped under
 * the primary kid), so callers can skip a no-op DB write.
 */
export function rewrapSecret(payload: string): string | null {
  const primary = primaryKek();
  if (payload.startsWith("v2.")) {
    const [, kid, wIv, wTag, wCt, dIv, dTag, dCt] = payload.split(".");
    if (!kid || !wIv || !wTag || !wCt || !dIv || !dTag || !dCt) throw new Error("malformed encrypted secret");
    if (kid === primary.kid) return null; // already current
    const kek = keyring().find((k) => k.kid === kid);
    if (!kek) throw new Error("no encryption key available to re-wrap this secret (kid mismatch)");
    const dek = gcmDecrypt(kek.key, unb64(wIv), unb64(wTag), unb64(wCt));
    const wrap = gcmEncrypt(primary.key, dek);
    return ["v2", primary.kid, b64(wrap.iv), b64(wrap.tag), b64(wrap.ct), dIv, dTag, dCt].join(".");
  }
  // Legacy → upgrade to v2 (fresh DEK) under the primary KEK.
  return encryptSecret(decryptSecret(payload));
}

/** The kid new secrets are wrapped under — handy for reporting rotation status. */
export function primaryKid(): string {
  return primaryKek().kid;
}

/** Compare two secrets in constant time (unused by callers today, but avoids leaks if added). */
export function secretsEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** For UI display: show only the last few chars of a secret. */
export function maskSecret(plain: string): string {
  if (!plain) return "";
  const tail = plain.slice(-4);
  return `••••••••${tail}`;
}
