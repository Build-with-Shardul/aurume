import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getActiveMembership } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { project, playbook, playbookApprover, aiGeneration, user } from "@/lib/db/schema";
import { buildPlaybookDocx, buildPlaybookPdf, type PlaybookDocData } from "@/lib/playbook-export";
import type { PlaybookContent } from "@/lib/ai/playbook";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const format = (req.nextUrl.searchParams.get("format") || "pdf").toLowerCase();
  if (format !== "pdf" && format !== "docx") return NextResponse.json({ error: "format must be pdf or docx" }, { status: 400 });

  const m = await getActiveMembership();
  if (!m?.orgId) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

  const p = (await db.select().from(project).where(eq(project.id, id)).limit(1))[0];
  if (!p || p.organizationId !== m.orgId) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const pb = (await db.select().from(playbook).where(eq(playbook.projectId, id)).orderBy(desc(playbook.version)).limit(1))[0];
  if (!pb) return NextResponse.json({ error: "No playbook to download yet." }, { status: 404 });

  const approvers = await db
    .select({ name: user.name, email: user.email, approvedAt: playbookApprover.approvedAt })
    .from(playbookApprover)
    .innerJoin(user, eq(user.id, playbookApprover.userId))
    .where(eq(playbookApprover.playbookId, pb.id));

  const gen = (await db
    .select({ prompt: aiGeneration.promptTokens, completion: aiGeneration.completionTokens })
    .from(aiGeneration)
    .where(eq(aiGeneration.playbookId, pb.id))
    .orderBy(desc(aiGeneration.createdAt))
    .limit(1))[0];

  const data: PlaybookDocData = {
    projectName: p.name,
    version: pb.version,
    status: pb.status,
    provider: pb.provider,
    model: pb.model,
    groundedness: pb.groundedness,
    tokens: gen ? (gen.prompt ?? 0) + (gen.completion ?? 0) : null,
    generatedAt: pb.createdAt,
    content: pb.content as PlaybookContent,
    approvers: approvers.map((a) => ({ name: a.name || a.email, approvedAt: a.approvedAt })),
  };

  const safeName = p.name.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "playbook";
  const filename = `Playbook-${safeName}-v${pb.version}.${format}`;

  const buf = format === "docx" ? await buildPlaybookDocx(data) : await buildPlaybookPdf(data);
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
