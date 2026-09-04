"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { knowledgeItem, projectDocument } from "@/lib/db/schema";
import { getAccessibleProject, canDeleteItem } from "@/lib/knowledge";
import { getReadableDocument } from "@/lib/wiki";
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

/** Map an org Wiki page into this project's knowledge base (also grants project
 * members read access to the page — see the access rule). */
export async function mapDocument(projectId: string, documentId: string) {
  const acc = await getAccessibleProject(projectId);
  if (!acc?.membership.orgId) return { error: "Not allowed." };
  // The user must be able to read the page they're mapping.
  const doc = await getReadableDocument(acc.membership.orgId, acc.membership.userId, documentId);
  if (!doc) return { error: "Not found." };
  const existing = await db
    .select({ id: projectDocument.id })
    .from(projectDocument)
    .where(and(eq(projectDocument.projectId, projectId), eq(projectDocument.documentId, documentId)))
    .limit(1);
  if (!existing[0]) {
    await db.insert(projectDocument).values({ id: crypto.randomUUID(), projectId, documentId, addedBy: acc.membership.userId });
  }
  revalidatePath(`/projects/${projectId}/knowledge`);
  revalidatePath(`/wiki/${documentId}`);
  return { ok: true };
}

export async function unmapDocument(projectId: string, documentId: string) {
  const acc = await getAccessibleProject(projectId);
  if (!acc) return { error: "Not allowed." };
  await db.delete(projectDocument).where(and(eq(projectDocument.projectId, projectId), eq(projectDocument.documentId, documentId)));
  revalidatePath(`/projects/${projectId}/knowledge`);
  revalidatePath(`/wiki/${documentId}`);
  return { ok: true };
}
