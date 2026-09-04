"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { saveDiagram, renameDiagram } from "../actions";

// Where the draw.io editor UI is served from. Point this at your self-hosted
// jgraph/drawio container in production; defaults to diagrams.net so it works with no
// infra. Only the editor UI comes from here — diagram data lives in our DB.
const DRAWIO = process.env.NEXT_PUBLIC_DRAWIO_URL || "https://embed.diagrams.net";

export default function DrawioEditor({ id, title, xml }: { id: string; title: string; xml: string }) {
  const router = useRouter();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const xmlRef = useRef<string>(xml || "");
  const exportTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [t, setT] = useState(title);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");

  const src = `${DRAWIO}?embed=1&proto=json&spin=1&libraries=1&noSaveBtn=1&modified=unsavedChanges`;

  useEffect(() => {
    const frame = frameRef.current;
    const send = (msg: unknown) => frame?.contentWindow?.postMessage(JSON.stringify(msg), "*");
    const requestExport = () => send({ action: "export", format: "xmlsvg" });
    const scheduleExport = () => {
      if (exportTimer.current) clearTimeout(exportTimer.current);
      exportTimer.current = setTimeout(requestExport, 1000);
    };

    async function onMessage(e: MessageEvent) {
      if (frame && e.source !== frame.contentWindow) return; // only the drawio frame
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
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-neutral-200 bg-white px-4 py-2">
        <button onClick={() => { router.push("/diagrams"); router.refresh(); }} className="rounded-lg border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50">← Diagrams</button>
        <input
          value={t}
          onChange={(e) => setT(e.target.value)}
          onBlur={saveTitle}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          className="min-w-0 flex-1 rounded px-1 text-sm font-semibold text-neutral-900 outline-none focus:bg-neutral-50"
        />
        <span className="text-xs text-neutral-400">{saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : ""}</span>
      </div>
      <iframe ref={frameRef} src={src} className="min-h-0 w-full flex-1 border-0" title="draw.io editor" />
    </div>
  );
}
