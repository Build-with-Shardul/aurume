import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { documentAsset } from "@/lib/db/schema";
import { readFile } from "@/lib/storage";
import { getSession, getActiveMembership } from "@/lib/auth-server";

// Serve a Wiki image to authenticated members of the owning workspace.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  const m = await getActiveMembership();
  if (!session?.user?.id || !m?.orgId) return new Response("Unauthorized", { status: 401 });

  const rows = await db
    .select()
    .from(documentAsset)
    .where(and(eq(documentAsset.id, id), eq(documentAsset.organizationId, m.orgId)))
    .limit(1);
  const asset = rows[0];
  if (!asset) return new Response("Not found", { status: 404 });

  try {
    const bytes = await readFile(asset.storageKey);
    return new Response(new Uint8Array(bytes), {
      headers: { "Content-Type": asset.mimeType || "application/octet-stream", "Cache-Control": "private, max-age=3600" },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
