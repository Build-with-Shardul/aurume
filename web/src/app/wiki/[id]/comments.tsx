"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { addComment, deleteComment } from "../actions";
import type { CommentItem } from "@/lib/wiki";
import { CommentComposer, CommentContent } from "../comment-editor";

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return (parts.length >= 2 ? parts[0][0] + parts[1][0] : name.slice(0, 2)).toUpperCase();
}

export default function Comments({ docId, comments, currentUserId }: { docId: string; comments: CommentItem[]; currentUserId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const childrenOf = useMemo(() => {
    const map = new Map<string | null, CommentItem[]>();
    for (const c of comments) {
      const k = c.parentId;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(c);
    }
    return map;
  }, [comments]);

  async function post(parentId: string | null, body: string, done: () => void) {
    if (busy) return;
    setBusy(true);
    const r = await addComment(docId, parentId, body);
    setBusy(false);
    if (r && "ok" in r) { done(); router.refresh(); }
  }

  async function remove(id: string) {
    setBusy(true);
    await deleteComment(id);
    setBusy(false);
    router.refresh();
  }

  const roots = childrenOf.get(null) ?? [];

  return (
    <div className="mx-auto mt-10 max-w-3xl border-t border-neutral-200 px-8 py-8">
      <h2 className="mb-4 text-sm font-semibold text-neutral-900">Comments <span className="font-normal text-neutral-400">({comments.length})</span></h2>

      <CommentComposer placeholder="Add a comment…" busy={busy} onSubmit={(body, done) => post(null, body, done)} />

      <div className="mt-6 space-y-5">
        {roots.length === 0 ? (
          <p className="text-sm text-neutral-400">No comments yet. Start the conversation.</p>
        ) : (
          roots.map((c) => <Node key={c.id} c={c} childrenOf={childrenOf} depth={0} currentUserId={currentUserId} busy={busy} onReply={post} onDelete={remove} />)
        )}
      </div>
    </div>
  );
}

function Node({
  c,
  childrenOf,
  depth,
  currentUserId,
  busy,
  onReply,
  onDelete,
}: {
  c: CommentItem;
  childrenOf: Map<string | null, CommentItem[]>;
  depth: number;
  currentUserId: string;
  busy: boolean;
  onReply: (parentId: string | null, body: string, done: () => void) => void;
  onDelete: (id: string) => void;
}) {
  const [replying, setReplying] = useState(false);
  const kids = childrenOf.get(c.id) ?? [];
  return (
    <div id={depth === 0 ? `comment-${c.id}` : undefined} style={{ marginLeft: depth > 0 ? 20 : 0 }} className={depth > 0 ? "border-l border-neutral-200 pl-4" : ""}>
      {depth === 0 && c.quote && (
        <p className="mb-1.5 border-l-2 border-yellow-400 bg-yellow-50 px-2 py-1 text-xs italic text-neutral-600">&ldquo;{c.quote}&rdquo;</p>
      )}
      <div className="flex gap-2.5">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-[10px] font-semibold text-neutral-700">{initials(c.authorName)}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium text-neutral-900">{c.authorName}</span>
            <span className="text-xs text-neutral-400">{c.createdLabel}</span>
          </div>
          <div className="mt-0.5"><CommentContent html={c.body} /></div>
          <div className="mt-1 flex items-center gap-3 text-xs text-neutral-400">
            <button onClick={() => setReplying((r) => !r)} className="hover:text-neutral-700">Reply</button>
            {c.authorId === currentUserId && <button onClick={() => onDelete(c.id)} className="hover:text-red-600">Delete</button>}
          </div>
          {replying && (
            <div className="mt-2">
              <CommentComposer placeholder={`Reply to ${c.authorName}…`} busy={busy} autoFocus onSubmit={(body, done) => onReply(c.id, body, () => { done(); setReplying(false); })} />
            </div>
          )}
        </div>
      </div>
      {kids.length > 0 && (
        <div className="mt-4 space-y-4">
          {kids.map((k) => <Node key={k.id} c={k} childrenOf={childrenOf} depth={depth + 1} currentUserId={currentUserId} busy={busy} onReply={onReply} onDelete={onDelete} />)}
        </div>
      )}
    </div>
  );
}
