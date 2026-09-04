"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { saveDiagram, renameDiagram, recordDiagramView } from "../actions";
import type { CommentItem, ReactionSummary, ShareUser } from "@/lib/wiki";
import DiagramReactions from "./diagram-reactions";
import DiagramComments from "./diagram-comments";
import DiagramSharePanel from "./diagram-share-panel";
import DiagramProjectsPanel, { type ProjectOption } from "./diagram-projects-panel";

const DRAWIO = process.env.NEXT_PUBLIC_DRAWIO_URL || "https://embed.diagrams.net";

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return (parts.length >= 2 ? parts[0][0] + parts[1][0] : name.slice(0, 2)).toUpperCase();
}

type Props = {
  id: string;
  title: string;
  xml: string;
  editable: boolean;
  currentUserId: string;
  authorName: string | null;
  lastEditedByName: string | null;
  createdLabel: string;
  updatedLabel: string;
  totalViews: number;
  projects: string[];
  reactions: ReactionSummary[];
  comments: CommentItem[];
  shares: ShareUser[];
  shareableUsers: ShareUser[];
  projectOptions: ProjectOption[];
};

export default function DrawioEditor(props: Props) {
  const { id, title, xml, editable, currentUserId, authorName, lastEditedByName, createdLabel, updatedLabel, totalViews, projects, reactions, comments, shares, shareableUsers, projectOptions } = props;
  const router = useRouter();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const xmlRef = useRef<string>(xml || "");
  const exportTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [t, setT] = useState(title);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [shareOpen, setShareOpen] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);

  const src = `${DRAWIO}?embed=1&proto=json&spin=1&libraries=1&noSaveBtn=1&modified=unsavedChanges`;

  useEffect(() => { recordDiagramView(id); }, [id]);

  useEffect(() => {
    const frame = frameRef.current;
    const send = (msg: unknown) => frame?.contentWindow?.postMessage(JSON.stringify(msg), "*");
    const requestExport = () => send({ action: "export", format: "xmlsvg" });
    const scheduleExport = () => { if (exportTimer.current) clearTimeout(exportTimer.current); exportTimer.current = setTimeout(requestExport, 1000); };

    async function onMessage(e: MessageEvent) {
      if (frame && e.source !== frame.contentWindow) return;
      let msg: { event?: string; xml?: string; data?: string } | null = null;
      try { msg = typeof e.data === "string" && e.data.startsWith("{") ? JSON.parse(e.data) : null; } catch { return; }
      if (!msg) return;
      if (msg.event === "init") {
        send({ action: "load", xml: xmlRef.current, autosave: 1 });
      } else if (msg.event === "autosave" || msg.event === "save") {
        if (typeof msg.xml === "string") { xmlRef.current = msg.xml; setSaveState("saving"); scheduleExport(); }
      } else if (msg.event === "export") {
        const preview = typeof msg.data === "string" ? msg.data : null;
        await saveDiagram(id, xmlRef.current, preview);
        setSaveState("saved");
      } else if (msg.event === "exit") {
        router.push("/diagrams");
        router.refresh();
      }
    }
    window.addEventListener("message", onMessage);
    return () => { window.removeEventListener("message", onMessage); if (exportTimer.current) clearTimeout(exportTimer.current); };
  }, [id, router]);

  async function saveTitle() {
    if (t.trim() === title.trim()) return;
    await renameDiagram(id, t);
    router.refresh();
  }

  return (
    <div>
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-neutral-200 bg-white px-4 py-2">
        <button onClick={() => { router.push("/diagrams"); router.refresh(); }} className="rounded-lg border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50">← Diagrams</button>
        <input
          value={t}
          onChange={(e) => setT(e.target.value)}
          onBlur={saveTitle}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          disabled={!editable}
          className="min-w-0 flex-1 rounded px-1 text-sm font-semibold text-neutral-900 outline-none focus:bg-neutral-50 disabled:bg-transparent"
        />
        <span className="text-xs text-neutral-400">{saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : ""}</span>
      </div>

      <iframe ref={frameRef} src={src} className="h-[68vh] min-h-[460px] w-full border-0" title="draw.io editor" />

      <div className="mx-auto max-w-3xl px-8 py-6">
        <div className="mb-3">
          <DiagramReactions diagramId={id} reactions={reactions} />
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span
            className="inline-flex cursor-default items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600"
            title={projects.length ? `In ${projects.length === 1 ? "project" : "projects"}:\n${projects.join("\n")}` : "Not associated with any project"}
          >
            🗂 {projects.length} {projects.length === 1 ? "project" : "projects"}
          </span>
          {editable && (
            <button onClick={() => setProjectsOpen(true)} title="Add to a project" className="flex h-5 w-5 items-center justify-center rounded-full border border-neutral-300 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M12 5v14M5 12h14" /></svg>
            </button>
          )}
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

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
          {authorName && (
            <span className="inline-flex items-center gap-1.5">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-neutral-200 text-[9px] font-semibold text-neutral-700">{initials(authorName)}</span>
              {authorName}
            </span>
          )}
          <span>·</span>
          <span>Created {createdLabel}</span>
          <span>·</span>
          <span>Updated {updatedLabel}{lastEditedByName ? ` by ${lastEditedByName}` : ""}</span>
          <span>·</span>
          <span>{totalViews} {totalViews === 1 ? "view" : "views"}</span>
        </div>

        <DiagramComments diagramId={id} comments={comments} currentUserId={currentUserId} />
      </div>

      {shareOpen && editable && <DiagramSharePanel diagramId={id} shares={shares} shareableUsers={shareableUsers} onClose={() => setShareOpen(false)} />}
      {projectsOpen && editable && <DiagramProjectsPanel diagramId={id} options={projectOptions} onClose={() => setProjectsOpen(false)} />}
    </div>
  );
}
