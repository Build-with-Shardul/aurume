import { promises as fs } from "fs";
import path from "path";

/**
 * Blob storage for the knowledge space. Filesystem-backed by default so Aurume
 * runs self-hosted with no extra cloud config. The surface is deliberately tiny
 * (save/read/remove) so an S3/R2 backend can replace it later without touching
 * callers. Override the location with AURUME_UPLOADS_DIR.
 */
const ROOT = process.env.AURUME_UPLOADS_DIR || path.join(process.cwd(), ".uploads");

function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-120) || "file";
}

/** Build the storage key for an item. Never derived from client input alone. */
export function buildKey(orgId: string, projectId: string, itemId: string, filename: string) {
  return path.posix.join(orgId, projectId, `${itemId}__${safeName(filename)}`);
}

function absPath(key: string) {
  // Resolve and guard against path traversal escaping ROOT.
  const abs = path.resolve(ROOT, key);
  if (abs !== ROOT && !abs.startsWith(ROOT + path.sep)) {
    throw new Error("Invalid storage key");
  }
  return abs;
}

export async function saveFile(key: string, bytes: Buffer) {
  const abs = absPath(key);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, bytes);
}

export async function readFile(key: string): Promise<Buffer> {
  return fs.readFile(absPath(key));
}

export async function removeFile(key: string) {
  try {
    await fs.unlink(absPath(key));
  } catch {
    // already gone — fine
  }
}
