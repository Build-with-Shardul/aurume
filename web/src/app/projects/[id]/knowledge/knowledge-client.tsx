"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { addKnowledgeNote, deleteKnowledgeItem } from "./actions";

type Item = {
  id: string;
  source: string;
  title: string;
  mimeType: string | null;
  sizeBytes: number | null;
  storageKey: string | null;
  uploadedBy: string | null;
  uploaderName: string | null;
  uploaderEmail: string | null;
  createdAt: Date | string;
};

const SOURCE_LABEL: Record<string, { label: string; cls: string }> = {
  upload: { label: "File", cls: "bg-blue-100 text-blue-700" },
  note: { label: "Note", cls: "bg-purple-100 text-purple-700" },
  slack: { label: "Slack", cls: "bg-green-100 text-green-700" },
  teams: { label: "Teams", cls: "bg-indigo-100 text-indigo-700" },
};

function fmtBytes(n: number | null) {
  if (n == null) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export default function KnowledgeClient({
  projectId,
  items,
  meId,
  canManage,
}: {
  projectId: string;
  items: Item[];
  meId: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteBody, setNoteBody] = useState("");

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setErr("");
    setBusy(true);
    for (const file of Array.from(files)) {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/projects/${projectId}/knowledge`, { method: "POST", body: fd });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr(j.error || `Failed to upload ${file.name}.`);
        break;
      }
    }
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
    router.refresh();
  }

  async function saveNote() {
    setErr("");
    setBusy(true);
    const r = await addKnowledgeNote(projectId, noteTitle, noteBody);
    setBusy(false);
    if (r?.error) return setErr(r.error);
    setNoteTitle("");
    setNoteBody("");
    setNoteOpen(false);
    router.refresh();
  }

  async function remove(id: string) {
    setErr("");
    setBusy(true);
    const r = await deleteKnowledgeItem(projectId, id);
    setBusy(false);
    if (r?.error) return setErr(r.error);
    router.refresh();
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {busy ? "Working…" : "Upload files"}
        </button>
        <input ref={fileRef} type="file" multiple hidden onChange={(e) => onFiles(e.target.files)} />
        <button
          onClick={() => setNoteOpen((v) => !v)}
          className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-white"
        >
          Add a note
        </button>
        <span className="text-xs text-neutral-400">Any format · up to 25 MB each</span>
      </div>

      {err && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}

      {noteOpen && (
        <div className="mt-4 rounded-xl border border-neutral-200 bg-white p-4">
          <input
            value={noteTitle}
            onChange={(e) => setNoteTitle(e.target.value)}
            placeholder="Note title"
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
          />
          <textarea
            value={noteBody}
            onChange={(e) => setNoteBody(e.target.value)}
            rows={4}
            placeholder="Context the AI should know — decisions, constraints, links…"
            className="mt-2 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
          />
          <div className="mt-2 flex gap-2">
            <button onClick={saveNote} disabled={busy || !noteTitle.trim()} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50">
              Save note
            </button>
            <button onClick={() => setNoteOpen(false)} className="text-sm text-neutral-500 hover:text-neutral-900">Cancel</button>
          </div>
        </div>
      )}

      <div className="mt-6 rounded-xl border border-neutral-200 bg-white">
        {items.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-neutral-400">
            Nothing here yet. Upload documents, spreadsheets, PDFs, images — anything the team knows about this project.
          </p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {items.map((it) => {
              const badge = SOURCE_LABEL[it.source] ?? SOURCE_LABEL.upload;
              const canDelete = it.uploadedBy === meId || canManage;
              return (
                <li key={it.id} className="flex items-center justify-between gap-3 px-6 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${badge.cls}`}>{badge.label}</span>
                      {it.storageKey ? (
                        <a href={`/api/projects/${projectId}/knowledge/${it.id}`} target="_blank" rel="noreferrer" className="truncate text-sm font-medium text-neutral-900 hover:underline">
                          {it.title}
                        </a>
                      ) : (
                        <span className="truncate text-sm font-medium text-neutral-900">{it.title}</span>
                      )}
                    </div>
                    <div className="mt-0.5 text-xs text-neutral-400">
                      {fmtBytes(it.sizeBytes)}
                      {it.sizeBytes != null ? " · " : ""}
                      {it.uploaderName || it.uploaderEmail || "someone"}
                      {" · "}
                      {new Date(it.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  {canDelete && (
                    <button
                      onClick={() => remove(it.id)}
                      disabled={busy}
                      className="shrink-0 rounded-md border border-neutral-300 px-2.5 py-1 text-xs hover:bg-neutral-50 disabled:opacity-50"
                    >
                      Delete
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
