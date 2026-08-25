import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { knowledgeItem } from "@/lib/db/schema";
import { getAccessibleOrg, MAX_UPLOAD_BYTES } from "@/lib/knowledge";
import { buildKey, saveFile } from "@/lib/storage";

function extractText(name: string, mime: string, buf: Buffer): string | null {
  const textual = /^text\//.test(mime) || /(json|csv|markdown)/.test(mime) || /\.(txt|md|markdown|csv|json|log)$/i.test(name);
  return textual ? buf.toString("utf8").slice(0, 200_000) : null;
}

// Upload an ORGANIZATION-level knowledge item (not tied to a project).
export async function POST(req: NextRequest) {
  const acc = await getAccessibleOrg();
  if (!acc?.membership.orgId) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file provided." }, { status: 400 });
  if (file.size === 0) return NextResponse.json({ error: "File is empty." }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "File exceeds the 25 MB limit." }, { status: 413 });

  const buf = Buffer.from(await file.arrayBuffer());
  const itemId = crypto.randomUUID();
  const key = buildKey(acc.membership.orgId, "_org", itemId, file.name);
  await saveFile(key, buf);

  await db.insert(knowledgeItem).values({
    id: itemId,
    organizationId: acc.membership.orgId,
    projectId: null,
    source: "upload",
    title: file.name,
    mimeType: file.type || null,
    sizeBytes: file.size,
    storageKey: key,
    content: extractText(file.name, file.type || "", buf),
    uploadedBy: acc.membership.userId,
  });

  return NextResponse.json({ ok: true, id: itemId });
}
