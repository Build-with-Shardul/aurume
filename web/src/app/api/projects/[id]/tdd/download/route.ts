import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getActiveMembership } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { project, techDoc, techDocApprover, aiGeneration, user } from "@/lib/db/schema";
import { buildTechDocDocx, buildTechDocPdf, type TechDocDocData } from "@/lib/techdoc-export";
import type { TechDocContent } from "@/lib/ai/techdoc";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const format = (req.nextUrl.searchParams.get("format") || "pdf").toLowerCase();
  if (format !== "pdf" && format !== "docx") return NextResponse.json({ error: "format must be pdf or docx" }, { status: 400 });

  const m = await getActiveMembership();
  if (!m?.orgId) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

  const p = (await db.select().from(project).where(eq(project.id, id)).limit(1))[0];
  if (!p || p.organizationId !== m.orgId) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const td = (await db.select().from(techDoc).where(eq(techDoc.projectId, id)).orderBy(desc(techDoc.version)).limit(1))[0];
  if (!td) return NextResponse.json({ error: "No tech doc to download yet." }, { status: 404 });

  const approvers = await db
    .select({ name: user.name, email: user.email, approvedAt: techDocApprover.approvedAt })
    .from(techDocApprover)
    .innerJoin(user, eq(user.id, techDocApprover.userId))
    .where(eq(techDocApprover.techDocId, td.id));

  const gen = (await db
    .select({ prompt: aiGeneration.promptTokens, completion: aiGeneration.completionTokens })
    .from(aiGeneration)
    .where(eq(aiGeneration.playbookId, td.id))
    .orderBy(desc(aiGeneration.createdAt))
    .limit(1))[0];

  const data: TechDocDocData = {
    projectName: p.name,
    version: td.version,
    status: td.status,
    provider: td.provider,
    model: td.model,
    groundedness: td.groundedness,
    tokens: gen ? (gen.prompt ?? 0) + (gen.completion ?? 0) : null,
    generatedAt: td.createdAt,
    sourcePlaybookVersion: td.sourcePlaybookVersion,
    content: td.content as TechDocContent,
    approvers: approvers.map((a) => ({ name: a.name || a.email, approvedAt: a.approvedAt })),
  };

  const safeName = p.name.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "tech-doc";
  const filename = `TechDesignDoc-${safeName}-v${td.version}.${format}`;

  const buf = format === "docx" ? await buildTechDocDocx(data) : await buildTechDocPdf(data);
  const contentType =
    format === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "application/pdf";

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buf.length),
    },
  });
}
