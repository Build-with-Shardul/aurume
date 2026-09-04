"use client";

import { useEffect, useRef, useState } from "react";
import type { CommentItem, ShareUser } from "@/lib/wiki";
import { CommentContent } from "../comment-editor";
import MentionInput from "./mention-input";

export type PopPos = { left: number; top?: number; bottom?: number; maxHeight: number };

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return (parts.length >= 2 ? parts[0][0] + parts[1][0] : name.slice(0, 2)).toUpperCase();
}

/**
 * A floating thread anchored to an inline-comment highlight. Reading and replying
 * both happen here — inline comments never appear in the page's Comments section.
 */
export default function InlineThreadPopover({
  pos,
  quote,
  items,
  currentUserId,
  mentionableUsers,
  busy,
  onSubmit,
  onDelete,
  onClose,
}: {
  pos: PopPos;
  quote: string;
  items: CommentItem[];
  currentUserId: string;
  mentionableUsers: ShareUser[];
  busy: boolean;
  onSubmit: (html: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [html, setHtml] = useState("");
  const [empty, setEmpty] = useState(true);
  const [resetKey, setResetKey] = useState(0);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (ref.current && ref.current.contains(t)) return;
      // Clicks inside the mention suggestion menu (rendered on document.body) must not close.
      if ((t as HTMLElement).closest?.(".wiki-suggest-menu")) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown, true); document.removeEventListener("keydown", onKey); };
  }, [onClose]);

  const creating = items.length === 0;

  function send() {
    if (empty || busy) return;
    onSubmit(html);
    setHtml("");
    setEmpty(true);
    setResetKey((k) => k + 1);
  }

  return (
    <div
      ref={ref}
      style={{ position: "fixed", left: pos.left, top: pos.top, bottom: pos.bottom, width: 320, zIndex: 60 }}
      className="rounded-xl border border-neutral-200 bg-white shadow-2xl"
    >
      <div className="flex items-center justify-between border-b border-neutral-100 px-3 py-2">
        <span className="text-xs font-semibold text-neutral-500">{creating ? "New comment" : "Comment"}</span>
        <button onClick={onClose} aria-label="Close" className="rounded p-0.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700">✕</button>
      </div>

      {quote && (
        <p className="mx-3 mt-2 line-clamp-2 border-l-2 border-yellow-400 bg-yellow-50 px-2 py-1 text-xs italic text-neutral-600">&ldquo;{quote}&rdquo;</p>
      )}

      {!creating && (
        <div className="space-y-3 overflow-y-auto px-3 py-2" style={{ maxHeight: pos.maxHeight }}>
          {items.map((c) => (
            <div key={c.id} className="flex gap-2">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-[9px] font-semibold text-neutral-700">{initials(c.authorName)}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-medium text-neutral-900">{c.authorName}</span>
                  <span className="text-neutral-400">{c.createdLabel}</span>
                  {c.authorId === currentUserId && (
                    <button onClick={() => onDelete(c.id)} disabled={busy} className="ml-auto text-neutral-300 hover:text-red-600 disabled:opacity-50">Delete</button>
                  )}
                </div>
                <div className="text-sm text-neutral-700"><CommentContent html={c.body} /></div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="border-t border-neutral-100 p-2">
        <div className="rounded-lg border border-neutral-300 focus-within:border-neutral-900">
          <MentionInput
            key={resetKey}
            users={mentionableUsers}
            autoFocus
            placeholder={creating ? "Add a comment…  (@ to mention)" : "Reply…  (@ to mention)"}
            onChange={(h, e) => { setHtml(h); setEmpty(e); }}
            onEnter={send}
          />
        </div>
        <div className="mt-1.5 flex justify-end">
          <button onClick={send} disabled={busy || empty} className="rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800 disabled:opacity-40">
            {creating ? "Comment" : "Reply"}
          </button>
        </div>
      </div>
    </div>
  );
}
