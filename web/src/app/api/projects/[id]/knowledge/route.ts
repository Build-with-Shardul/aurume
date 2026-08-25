import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { knowledgeItem } from "@/lib/db/schema";
import { getAccessibleProject, MAX_UPLOAD_BYTES } from "@/lib/knowledge";
import { buildKey, saveFile } from "@/lib/storage";

// Any file type is accepted. We capture UTF-8 text for plainly-textual files so
// the AI retrieval hook has real content today; richer parsing (PDF/xlsx/docx)
// lands later and will populate `content` for those too.
function extractText(name: string, mime: string, buf: Buffer): string | null {
  const textual = /^text\//.test(mime) || /(json|csv|markdown)/.test(mime) || /\.(txt|md|markdown|csv|json|log)$/i.test(name);
  return textual ? buf.toString("utf8").slice(0, 200_000) : null;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const acc = await getAccessibleProject(id);
  if (!acc?.membership.orgId) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file provided." }, { status: 400 });
  if (file.size === 0) return NextResponse.json({ error: "File is empty." }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "File exceeds the 25 MB limit." }, { status: 413 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const itemId = crypto.randomUUID();
  const key = buildKey(acc.membership.orgId, id, itemId, file.name);
  await saveFile(key, buf);

  await db.insert(knowledgeItem).values({
    id: itemId,
    organizationId: acc.membership.orgId,
    projectId: id,
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
