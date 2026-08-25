"use server";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { knowledgeItem } from "@/lib/db/schema";
import { getAccessibleProject, canDeleteItem } from "@/lib/knowledge";
import { removeFile } from "@/lib/storage";

export async function addKnowledgeNote(projectId: string, title: string, content: string) {
  const acc = await getAccessibleProject(projectId);
  if (!acc?.membership.orgId) return { error: "Not allowed." };
  const t = title?.trim();
  if (!t) return { error: "A title is required." };
  await db.insert(knowledgeItem).values({
    id: crypto.randomUUID(),
    organizationId: acc.membership.orgId,
    projectId,
    source: "note",
    title: t,
    content: content?.trim() || null,
    uploadedBy: acc.membership.userId,
  });
  return { ok: true };
}

export async function deleteKnowledgeItem(projectId: string, itemId: string) {
  const acc = await getAccessibleProject(projectId);
  if (!acc) return { error: "Not allowed." };
  const item = (await db.select().from(knowledgeItem).where(eq(knowledgeItem.id, itemId)).limit(1))[0];
  if (!item || item.projectId !== projectId) return { error: "Not found." };
  if (!canDeleteItem(item, acc.project, acc.membership)) {
    return { error: "Only the uploader or a manager can delete this." };
  }
  if (item.storageKey) await removeFile(item.storageKey);
  await db.delete(knowledgeItem).where(eq(knowledgeItem.id, itemId));
  return { ok: true };
}
