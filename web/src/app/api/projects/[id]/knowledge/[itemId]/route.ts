import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { knowledgeItem } from "@/lib/db/schema";
import { getAccessibleProject } from "@/lib/knowledge";
import { readFile } from "@/lib/storage";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const { id, itemId } = await params;
  const acc = await getAccessibleProject(id);
  if (!acc) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

  const item = (await db.select().from(knowledgeItem).where(eq(knowledgeItem.id, itemId)).limit(1))[0];
  if (!item || item.projectId !== id || !item.storageKey) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  let buf: Buffer;
  try {
    buf = await readFile(item.storageKey);
  } catch {
    return NextResponse.json({ error: "File is no longer available." }, { status: 410 });
  }

  const mime = item.mimeType || "application/octet-stream";
  const inline = mime.startsWith("image/") || mime === "application/pdf";
  const safeTitle = item.title.replace(/"/g, "");
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": mime,
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${safeTitle}"`,
      "Content-Length": String(buf.length),
    },
  });
}
