"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { askAssistant } from "@/app/assistant-actions";

type Msg = { role: "user" | "assistant"; content: string };

export default function AppAssistant() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    try { if (localStorage.getItem("aurume.assistant") === "1") setOpen(true); } catch { /* ignore */ }
  }, []);
  const toggle = () => setOpen((o) => { const n = !o; try { localStorage.setItem("aurume.assistant", n ? "1" : "0"); } catch { /* ignore */ } return n; });
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, sending]);

  const projMatch = pathname.match(/^\/projects\/([^/]+)/);
  const projectId = projMatch && projMatch[1] !== "new" ? projMatch[1] : undefined;

  async function send() {
    const q = input.trim();
    if (!q || sending) return;
    const history = messages.slice(-6);
    setInput("");
    setError(null);
    setMessages((mm) => [...mm, { role: "user", content: q }]);
    setSending(true);
    try {
      const res = await askAssistant(q, { projectId, history });
      if (res && "error" in res && res.error) setError(res.error);
      else if (res && "answer" in res && res.answer) setMessages((mm) => [...mm, { role: "assistant", content: res.answer }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setSending(false);
    }
  }

  if (!open) {
    return (
      <div className="sticky top-0 flex h-screen w-12 shrink-0 flex-col items-center border-l border-neutral-200 bg-white py-4">
        <button onClick={toggle} title="Ask Aurume" aria-label="Open assistant" className="rounded-lg p-2 text-lg hover:bg-neutral-100">💬</button>
      </div>
    );
  }

  return (
    <aside className="sticky top-0 flex h-screen w-96 shrink-0 flex-col border-l border-neutral-200 bg-white">
      <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
        <div className="text-sm font-semibold">
          Ask Aurume{projectId && <span className="ml-1 text-xs font-normal text-neutral-400">· this project</span>}
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && <button onClick={() => setMessages([])} className="rounded px-1.5 py-0.5 text-xs text-neutral-400 hover:text-neutral-700" title="Clear conversation">Clear</button>}
          <button onClick={toggle} className="rounded p-1 text-neutral-400 hover:text-neutral-700" title="Collapse" aria-label="Collapse assistant">»</button>
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4 text-sm">
        {messages.length === 0 && (
          <div className="text-neutral-400">
            Ask about your projects, product playbook, tech design, stories, test cases, or knowledge. Answers use only what&apos;s in your workspace.
          </div>
        )}
        {messages.map((mm, i) => (
          <div key={i} className={mm.role === "user" ? "flex justify-end" : "flex"}>
            <div className={`max-w-[85%] whitespace-pre-wrap rounded-xl px-3 py-2 ${mm.role === "user" ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-800"}`}>{mm.content}</div>
          </div>
        ))}
        {sending && <div className="text-xs text-neutral-400">Thinking…</div>}
        {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}
        <div ref={endRef} />
      </div>

      <div className="border-t border-neutral-200 p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            rows={1}
            placeholder="Ask a question…"
            className="max-h-32 min-h-[38px] flex-1 resize-none rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
          />
          <button onClick={send} disabled={sending || !input.trim()} className="rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-40">Send</button>
        </div>
      </div>
    </aside>
  );
}
