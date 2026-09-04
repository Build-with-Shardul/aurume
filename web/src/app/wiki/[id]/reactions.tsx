"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toggleReaction } from "../actions";
import type { ReactionSummary } from "@/lib/wiki";

const PALETTE = ["👍", "❤️", "🎉", "🚀", "👀", "😄", "🙏", "🔥"];

export default function Reactions({ docId, reactions }: { docId: string; reactions: ReactionSummary[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function toggle(emoji: string) {
    if (busy) return;
    setBusy(true);
    await toggleReaction(docId, emoji);
    setBusy(false);
    setOpen(false);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {reactions.map((r) => (
        <button
          key={r.emoji}
          onClick={() => toggle(r.emoji)}
          className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-sm transition-colors ${
            r.mine ? "border-blue-300 bg-blue-50" : "border-neutral-200 hover:bg-neutral-50"
          }`}
        >
          <span>{r.emoji}</span>
          <span className="text-xs text-neutral-600">{r.count}</span>
        </button>
      ))}
      <div className="relative">
        <button onClick={() => setOpen((o) => !o)} title="Add reaction" className="flex h-[26px] items-center gap-0.5 rounded-full border border-neutral-200 px-2 text-sm text-neutral-500 hover:bg-neutral-50">
          🙂<span className="text-xs">+</span>
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
            <div className="absolute left-0 z-30 mt-1 flex gap-0.5 rounded-lg border border-neutral-200 bg-white p-1.5 shadow-lg">
              {PALETTE.map((e) => (
                <button key={e} onClick={() => toggle(e)} className="rounded p-1 text-base hover:bg-neutral-100">{e}</button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
