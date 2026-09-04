"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import WikiEditor from "../wiki-editor";
import ConfirmDialog from "../confirm-dialog";
import Reactions from "./reactions";
import Comments from "./comments";
import History from "./history";
import { renameDocument, updateDocumentBody, setDocumentVisibility, archiveDocument, deleteDocument, recordView } from "../actions";
import type { ReactionSummary, CommentItem } from "@/lib/wiki";

type Props = {
  id: string;
  title: string;
  body: unknown;
  icon: string | null;
  visibility: "workspace" | "private";
  archived: boolean;
  editable: boolean;
  authorName: string | null;
  lastEditedByName: string | null;
  createdLabel: string;
  updatedLabel: string;
  readMinutes: number;
  totalViews: number;
  viewsByDate: { date: string; count: number }[];
  sharedWith: string[];
  reactions: ReactionSummary[];
  comments: CommentItem[];
  currentUserId: string;
};

function initials(name: string | null) {
  const s = (name || "").trim();
  if (!s) return "?";
  const parts = s.split(/\s+/);
  return (parts.length >= 2 ? parts[0][0] + parts[1][0] : s.slice(0, 2)).toUpperCase();
}

export default function DocumentView(props: Props) {
  const { id, title, body, visibility, archived, editable, authorName, lastEditedByName, createdLabel, updatedLabel, readMinutes, totalViews, viewsByDate, sharedWith, reactions, comments, currentUserId } = props;
  const router = useRouter();
  const [t, setT] = useState(title);
  const [vis, setVis] = useState(visibility);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [confirmDel, setConfirmDel] = useState(false);
  const [delBusy, setDelBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewed = useRef(false);

  useEffect(() => {
    if (viewed.current) return;
    viewed.current = true;
    recordView(id);
  }, [id]);

  async function saveTitle() {
    if (t.trim() === title.trim()) return;
    await renameDocument(id, t);
    router.refresh();
  }

  function onBody(json: unknown, text: string) {
    if (!editable) return;
    setStatus("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      await updateDocumentBody(id, json, text);
      setStatus("saved");
    }, 700);
  }

  async function toggleVis() {
    const next = vis === "workspace" ? "private" : "workspace";
    setVis(next);
    await setDocumentVisibility(id, next);
    router.refresh();
  }

  async function doArchive() {
    await archiveDocument(id, true);
    router.push("/wiki");
    router.refresh();
  }

  async function confirmDelete() {
    setDelBusy(true);
    await deleteDocument(id);
    setDelBusy(false);
    setConfirmDel(false);
    router.push("/wiki");
    router.refresh();
  }

  return (
    <>
    <div className="mx-auto max-w-3xl px-8 py-10">
      <div className="mb-6 flex h-6 items-center justify-between">
        <span className="text-xs text-neutral-400">{status === "saving" ? "Saving…" : status === "saved" ? "Saved" : ""}</span>
        <div className="flex items-center gap-2">
          <History docId={id} editable={editable} />
          {editable && (
            <>
              <button onClick={toggleVis} title="Toggle visibility" className="rounded-lg border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50">
                {vis === "workspace" ? "🌐 Workspace" : "🔒 Private"}
              </button>
              <button onClick={doArchive} className="rounded-lg border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50">Archive</button>
              <button onClick={() => setConfirmDel(true)} className="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50">Delete</button>
            </>
          )}
        </div>
      </div>

      <div className="flex items-start justify-between gap-4">
        <input
          value={t}
          onChange={(e) => setT(e.target.value)}
          onBlur={saveTitle}
          disabled={!editable}
          placeholder="Untitled"
          className="min-w-0 flex-1 border-0 bg-transparent text-3xl font-bold leading-tight text-neutral-900 outline-none placeholder:text-neutral-300 disabled:cursor-default"
        />
        <div className="shrink-0 pt-2">
          <Reactions docId={id} reactions={reactions} />
        </div>
      </div>

      {/* Metadata bar */}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
        {authorName && (
          <span className="flex items-center gap-1.5">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-neutral-200 text-[9px] font-semibold text-neutral-700">{initials(authorName)}</span>
            {authorName}
          </span>
        )}
        <span>·</span>
        <span>{readMinutes} min read</span>
        <span>·</span>
        <span>Created {createdLabel}</span>
        <span>·</span>
        <span>Updated {updatedLabel}{lastEditedByName ? ` by ${lastEditedByName}` : ""}</span>
        <span>·</span>
        <ViewsStat total={totalViews} byDate={viewsByDate} />
        {sharedWith.length > 0 && (
          <>
            <span>·</span>
            <span title={sharedWith.join(", ")}>Shared with {sharedWith.length === 1 ? sharedWith[0] : `${sharedWith.length} projects`}</span>
          </>
        )}
      </div>

      {archived && <div className="mt-3 rounded-lg bg-amber-50 px-3 py-1.5 text-xs text-amber-800">This page is archived.</div>}

      <div className="mt-5">
        <WikiEditor docId={id} content={body} editable={editable} onChange={onBody} />
      </div>
    </div>

      <Comments docId={id} comments={comments} currentUserId={currentUserId} />

      <ConfirmDialog
        open={confirmDel}
        title="Delete page?"
        message={`"${t || "Untitled"}" and all of its subpages will be permanently deleted. This can't be undone.`}
        busy={delBusy}
        onConfirm={confirmDelete}
        onCancel={() => setConfirmDel(false)}
      />
    </>
  );
}

function ViewsStat({ total, byDate }: { total: number; byDate: { date: string; count: number }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-1 rounded px-1 hover:bg-neutral-100 hover:text-neutral-700">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>
        {total} {total === 1 ? "view" : "views"}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute left-0 z-30 mt-1 w-48 rounded-lg border border-neutral-200 bg-white p-2 shadow-lg">
            <div className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Views by date</div>
            {byDate.length === 0 ? (
              <p className="px-1 py-1 text-xs text-neutral-400">No views yet</p>
            ) : (
              byDate.slice(0, 10).map((v) => (
                <div key={v.date} className="flex items-center justify-between px-1 py-0.5 text-xs text-neutral-600">
                  <span>{v.date}</span>
                  <span className="font-medium text-neutral-900">{v.count}</span>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </span>
  );
}
