"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import WikiEditor, { type InlineThread } from "../wiki-editor";
import ConfirmDialog from "../confirm-dialog";
import Reactions from "./reactions";
import Comments from "./comments";
import SharePanel from "./share-panel";
import { renameDocument, updateDocumentBody, setDocumentVisibility, archiveDocument, deleteDocument, recordView, publishDocument } from "../actions";
import type { ReactionSummary, CommentItem, ShareUser } from "@/lib/wiki";

type Props = {
  id: string;
  title: string;
  readBody: unknown;
  workingBody: unknown;
  icon: string | null;
  visibility: "workspace" | "private";
  status: "draft" | "published";
  hasUnpublishedChanges: boolean;
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
  shares: ShareUser[];
  shareableUsers: ShareUser[];
  reactions: ReactionSummary[];
  comments: CommentItem[];
  currentUserId: string;
};

export default function DocumentView(props: Props) {
  const { id, title, readBody, workingBody, visibility, status, hasUnpublishedChanges, archived, editable, authorName, lastEditedByName, createdLabel, updatedLabel, readMinutes, totalViews, viewsByDate, sharedWith, shares, shareableUsers, reactions, comments, currentUserId } = props;
  const router = useRouter();
  const [t, setT] = useState(title);
  const [vis, setVis] = useState(visibility);
  const [mode, setMode] = useState<"read" | "edit">(editable && status === "draft" ? "edit" : "read");
  const [dirty, setDirty] = useState(hasUnpublishedChanges);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "offline">("idle");
  const [confirmDel, setConfirmDel] = useState(false);
  const [delBusy, setDelBusy] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [editContent, setEditContent] = useState<unknown>(workingBody);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<{ json: unknown; text: string } | null>(null);
  const booted = useRef(false);

  const key = `aurume.wiki.pending.${id}`;

  // Inline-anchored threads (a root comment carrying a `quote`) live only in the
  // editor as bubbles; everything else is a page-level comment for the section below.
  const { pageComments, inlineThreads } = useMemo(() => {
    const parentMap = new Map<string, string | null>(comments.map((c) => [c.id, c.parentId]));
    const inlineRootIds = new Set(comments.filter((c) => !c.parentId && c.quote).map((c) => c.id));
    const inlineRootOf = (cid: string): string | null => {
      let cur: string | null = cid;
      const seen = new Set<string>();
      while (cur && !seen.has(cur)) {
        seen.add(cur);
        if (inlineRootIds.has(cur)) return cur;
        cur = parentMap.get(cur) ?? null;
      }
      return null;
    };
    const page: CommentItem[] = [];
    for (const c of comments) if (!inlineRootOf(c.id)) page.push(c);
    const threads: InlineThread[] = comments
      .filter((c) => inlineRootIds.has(c.id))
      .map((root) => ({ id: root.id, quote: root.quote, items: comments.filter((c) => inlineRootOf(c.id) === root.id) }));
    return { pageComments: page, inlineThreads: threads };
  }, [comments]);

  async function flush() {
    if (!pending.current) return;
    const { json, text } = pending.current;
    setSaveState("saving");
    try {
      // Stringify: passing the doc object directly drops custom mark attrs at the action boundary.
      const r = await updateDocumentBody(id, JSON.stringify(json), text);
      if (r && "error" in r && r.error) throw new Error(r.error);
      pending.current = null;
      try { localStorage.removeItem(key); } catch { /* ignore */ }
      setSaveState("saved");
    } catch {
      setSaveState("offline"); // keep buffer; retry on reconnect
    }
  }

  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    let buf: { json: unknown; text: string } | null = null;
    try { const raw = localStorage.getItem(key); if (raw) buf = JSON.parse(raw); } catch { /* ignore */ }
    if (buf?.json && editable) {
      setEditContent(buf.json);
      setMode("edit");
      pending.current = buf;
      flush();
    }
    setReady(true);
    recordView(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    const onOnline = () => flush();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveTitle() {
    if (t.trim() === title.trim()) return;
    await renameDocument(id, t);
    router.refresh();
  }

  function onBody(json: unknown, text: string) {
    if (mode !== "edit") return;
    pending.current = { json, text };
    try { localStorage.setItem(key, JSON.stringify({ json, text })); } catch { /* ignore */ }
    setSaveState("saving");
    if (status === "published") setDirty(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 700);
  }

  async function toggleVis() {
    const next = vis === "workspace" ? "private" : "workspace";
    setVis(next);
    await setDocumentVisibility(id, next);
    router.refresh();
  }
  async function doArchive() { await archiveDocument(id, true); router.push("/wiki"); router.refresh(); }
  async function confirmDelete() {
    setDelBusy(true);
    await deleteDocument(id);
    setDelBusy(false);
    setConfirmDel(false);
    router.push("/wiki");
    router.refresh();
  }
  async function publish() {
    setPublishing(true);
    if (pending.current) await flush(); // publish the latest working content
    await publishDocument(id);
    setPublishing(false);
    setDirty(false);
    router.refresh();
  }
  async function stopEdit() {
    if (pending.current) await flush();
    setMode("read");
  }

  const saveLabel = saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : saveState === "offline" ? "Offline — will save when you reconnect" : "";
  const showPublish = editable && (status === "draft" || dirty);

  return (
    <>
      <div className="mx-auto max-w-3xl px-8 py-10">
        <div className="mb-6 flex h-6 items-center justify-between">
          <div className="flex items-center gap-2">
            {status === "draft" ? (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700">Draft</span>
            ) : dirty ? (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">Unpublished changes</span>
            ) : null}
            {mode === "edit" && <span className={`text-xs ${saveState === "offline" ? "text-amber-600" : "text-neutral-400"}`}>{saveLabel}</span>}
          </div>
          <div className="flex items-center gap-2">
            {showPublish && (
              <button onClick={publish} disabled={publishing} className="rounded-lg bg-neutral-900 px-3 py-1 text-xs font-medium text-white hover:bg-neutral-800 disabled:opacity-50">
                {publishing ? "Publishing…" : status === "draft" ? "Publish" : "Publish changes"}
              </button>
            )}
            {editable && (mode === "read"
              ? <button onClick={() => setMode("edit")} className="rounded-lg border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50">Edit</button>
              : <button onClick={stopEdit} className="rounded-lg border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50">Done</button>
            )}
            <Link href={`/wiki/${id}/history`} className="rounded-lg border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50">History</Link>
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

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span
            className="inline-flex cursor-default items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600"
            title={sharedWith.length ? `In ${sharedWith.length === 1 ? "project" : "projects"}:\n${sharedWith.join("\n")}` : "Not associated with any project"}
          >
            🗂 {sharedWith.length} {sharedWith.length === 1 ? "project" : "projects"}
          </span>
          <button
            onClick={() => editable && setShareOpen(true)}
            disabled={!editable}
            title={shares.length ? shares.map((s) => s.name).join(", ") : "Not shared with anyone"}
            className={`inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600 ${editable ? "hover:bg-neutral-200" : "cursor-default"}`}
          >
            👥 Shared with {shares.length} {shares.length === 1 ? "person" : "people"}
          </button>
          {editable && (
            <button onClick={() => setShareOpen(true)} title="Share with more people" className="flex h-5 w-5 items-center justify-center rounded-full border border-neutral-300 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M12 5v14M5 12h14" /></svg>
            </button>
          )}
        </div>

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
        </div>

        {archived && <div className="mt-3 rounded-lg bg-amber-50 px-3 py-1.5 text-xs text-amber-800">This page is archived.</div>}

        <div className="mt-5">
          {ready ? (
            <WikiEditor key={mode} docId={id} content={mode === "edit" ? editContent : readBody} editable={mode === "edit"} onChange={onBody} inlineThreads={inlineThreads} currentUserId={currentUserId} />
          ) : (
            <div className="min-h-[320px]" />
          )}
        </div>
      </div>

      {shareOpen && editable && <SharePanel docId={id} shares={shares} shareableUsers={shareableUsers} onClose={() => setShareOpen(false)} />}

      <Comments docId={id} comments={pageComments} currentUserId={currentUserId} />

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

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return (parts.length >= 2 ? parts[0][0] + parts[1][0] : name.slice(0, 2)).toUpperCase();
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
