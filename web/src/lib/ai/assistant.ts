import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { project, playbook, techDoc, epic, story, testPlan, testCase } from "../db/schema";
import { getKnowledgeForAI } from "../knowledge";
import { generateStructured } from "./provider";
import { buildKnowledgeContext } from "./playbook";

const AnswerSchema = z.object({ answer: z.string() });

type PbContent = { projectSummary?: string; keyHypothesis?: string; projectType?: string; inScopeEpics?: Array<{ name: string }>; kpis?: Array<{ metric: string; targetValue: string }> };
type TdContent = { overview?: string; architectureOverview?: string; securityPrivacy?: string };

/** Assemble a bounded, relevant slice of the workspace for the assistant to answer from. */
async function gatherContext(orgId: string, projectId?: string): Promise<string> {
  const parts: string[] = [];

  const projs = await db.select({ id: project.id, name: project.name, description: project.description }).from(project).where(eq(project.organizationId, orgId));
  parts.push("PROJECTS IN THIS WORKSPACE:\n" + (projs.length ? projs.map((p) => `- ${p.name}${p.description ? `: ${p.description}` : ""}`).join("\n") : "(none)"));

  if (projectId) {
    const p = projs.find((x) => x.id === projectId);
    if (p) parts.push(`CURRENT PROJECT: ${p.name}`);

    const pb = (await db.select().from(playbook).where(eq(playbook.projectId, projectId)).orderBy(desc(playbook.version)).limit(1))[0];
    if (pb) {
      const c = pb.content as PbContent;
      parts.push(`PRODUCT PLAYBOOK (v${pb.version}, ${pb.status}):\nSummary: ${c.projectSummary ?? ""}\nKey hypothesis: ${c.keyHypothesis ?? ""}\nType: ${c.projectType ?? ""}\nIn-scope epics: ${(c.inScopeEpics ?? []).map((e) => e.name).join(", ")}\nKPIs: ${(c.kpis ?? []).map((k) => `${k.metric} = ${k.targetValue}`).join("; ")}`);
    }
    const td = (await db.select().from(techDoc).where(eq(techDoc.projectId, projectId)).orderBy(desc(techDoc.version)).limit(1))[0];
    if (td) {
      const c = td.content as TdContent;
      parts.push(`TECHNICAL DESIGN (v${td.version}, ${td.status}):\nOverview: ${c.overview ?? ""}\nArchitecture: ${c.architectureOverview ?? ""}\nSecurity: ${c.securityPrivacy ?? ""}`);
    }
    const epics = await db.select({ name: epic.name }).from(epic).where(eq(epic.projectId, projectId));
    if (epics.length) parts.push("EPICS: " + epics.map((e) => e.name).join(", "));
    const stories = await db.select({ title: story.title }).from(story).where(eq(story.projectId, projectId)).limit(80);
    if (stories.length) parts.push(`STORIES (${stories.length}): ` + stories.map((s) => s.title).join("; "));
    const plan = (await db.select().from(testPlan).where(eq(testPlan.projectId, projectId)).orderBy(desc(testPlan.version)).limit(1))[0];
    if (plan) {
      const count = (await db.select({ id: testCase.id }).from(testCase).where(eq(testCase.testPlanId, plan.id))).length;
      parts.push(`TEST PLAN: v${plan.version} (${plan.status}), ${count} test cases.`);
    }

    const knowledge = await getKnowledgeForAI(projectId);
    const { contextText } = buildKnowledgeContext(knowledge, 8000);
    if (contextText.trim()) parts.push("KNOWLEDGE:\n" + contextText);
  }

  return parts.join("\n\n").slice(0, 18000);
}

const ASSISTANT_SYSTEM = [
  "You are Aurume's in-app assistant. Answer the user's question using ONLY the WORKSPACE CONTEXT provided (projects, product playbook, technical design, epics, stories, test plan, and knowledge).",
  "Be concise, concrete, and helpful; use short markdown when it aids readability.",
  "If the context doesn't contain the answer, say you don't have that in the workspace yet and suggest where it would live (e.g. the playbook, tech doc, or knowledge space). Never invent facts, metrics, or names that aren't in the context.",
].join(" ");

export async function answerQuestion(opts: {
  orgId: string;
  projectId?: string;
  question: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  model?: string;
}): Promise<string> {
  const context = await gatherContext(opts.orgId, opts.projectId);
  const hist = opts.history.slice(-6).map((h) => `${h.role === "user" ? "User" : "Assistant"}: ${h.content}`).join("\n");
  const prompt = [
    "WORKSPACE CONTEXT:",
    context,
    "",
    hist ? `CONVERSATION SO FAR:\n${hist}\n` : "",
    "USER QUESTION:",
    opts.question,
  ]
    .filter(Boolean)
    .join("\n");

  const res = await generateStructured({
    orgId: opts.orgId,
    system: ASSISTANT_SYSTEM,
    prompt,
    schema: AnswerSchema,
    schemaName: "assistant_answer",
    model: opts.model,
    maxTokens: 1500,
  });
  return res.data.answer;
}
