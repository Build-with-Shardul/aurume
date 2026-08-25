"use server";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { knowledgeItem } from "@/lib/db/schema";
import { getAccessibleOrg, canDeleteOrgItem } from "@/lib/knowledge";
import { removeFile } from "@/lib/storage";

export async function addOrgKnowledgeNote(title: string, content: string) {
  const acc = await getAccessibleOrg();
  if (!acc?.membership.orgId) return { error: "Not allowed." };
  const t = title?.trim();
  if (!t) return { error: "A title is required." };
  await db.insert(knowledgeItem).values({
    id: crypto.randomUUID(),
    organizationId: acc.membership.orgId,
    projectId: null,
    source: "note",
    title: t,
    content: content?.trim() || null,
    uploadedBy: acc.membership.userId,
  });
  return { ok: true };
}

export async function deleteOrgKnowledgeItem(itemId: string) {
  const acc = await getAccessibleOrg();
  if (!acc?.membership.orgId) return { error: "Not allowed." };
  const item = (await db.select().from(knowledgeItem).where(eq(knowledgeItem.id, itemId)).limit(1))[0];
  if (!item || item.organizationId !== acc.membership.orgId) return { error: "Not found." };
  // Only org-level items are managed here; project items are deleted from their project.
  if (item.projectId !== null) return { error: "Delete this from its project." };
  if (!canDeleteOrgItem(item, acc.membership)) return { error: "Only the uploader or an admin can delete this." };
  if (item.storageKey) await removeFile(item.storageKey);
  await db.delete(knowledgeItem).where(eq(knowledgeItem.id, itemId));
  return { ok: true };
}
