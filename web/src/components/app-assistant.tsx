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
      <div className="sticky top-0 flex h-screen w-12 shrink-0 flex-col items-center justify-end border-l border-neutral-200 bg-white py-4">
        <button onClick={toggle} title="Ask Aurume" aria-label="Open assistant" className="rounded-lg p-2 text-neutral-900 hover:bg-neutral-100">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>
        </button>
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
            {mm.role === "user" ? (
              <div className="max-w-[85%] whitespace-pre-wrap rounded-xl bg-neutral-900 px-3 py-2 text-white">{mm.content}</div>
            ) : (
              <div className="max-w-[85%] rounded-xl bg-neutral-100 px-3 py-2 leading-relaxed text-neutral-800">
                <Markdown text={mm.content} />
              </div>
            )}
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

// --- tiny markdown renderer (bold / italic / inline code / bullet & numbered lists / headings) ---
function renderInline(text: string, keyBase: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const regex = /(\*\*([^*]+)\*\*|`([^`]+)`|\*([^*]+)\*|_([^_]+)_)/g;
  let last = 0;
  let i = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[2] != null) nodes.push(<strong key={`${keyBase}-${i}`}>{m[2]}</strong>);
    else if (m[3] != null) nodes.push(<code key={`${keyBase}-${i}`} className="rounded bg-black/10 px-1 py-0.5 font-mono text-[12px]">{m[3]}</code>);
    else if (m[4] != null) nodes.push(<em key={`${keyBase}-${i}`}>{m[4]}</em>);
    else if (m[5] != null) nodes.push(<em key={`${keyBase}-${i}`}>{m[5]}</em>);
    last = m.index + m[0].length;
    i++;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function Markdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let list: { type: "ul" | "ol"; items: string[] } | null = null;
  let para: string[] = [];
  const flushPara = () => {
    if (para.length) { const k = `p${blocks.length}`; blocks.push(<p key={k}>{renderInline(para.join(" "), k)}</p>); para = []; }
  };
  const flushList = () => {
    if (!list) return;
    const k = `l${blocks.length}`;
    const items = list.items.map((it, i) => <li key={`${k}-${i}`}>{renderInline(it, `${k}-${i}`)}</li>);
    blocks.push(list.type === "ul" ? <ul key={k} className="list-disc space-y-0.5 pl-5">{items}</ul> : <ol key={k} className="list-decimal space-y-0.5 pl-5">{items}</ol>);
    list = null;
  };
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    const bullet = line.match(/^\s*[-*]\s+(.*)/);
    const num = line.match(/^\s*\d+\.\s+(.*)/);
    const heading = line.match(/^#{1,6}\s+(.*)/);
    if (bullet) { flushPara(); if (!list || list.type !== "ul") { flushList(); list = { type: "ul", items: [] }; } list.items.push(bullet[1]); }
    else if (num) { flushPara(); if (!list || list.type !== "ol") { flushList(); list = { type: "ol", items: [] }; } list.items.push(num[1]); }
    else if (heading) { flushPara(); flushList(); const k = `h${blocks.length}`; blocks.push(<p key={k} className="font-semibold">{renderInline(heading[1], k)}</p>); }
    else if (line.trim() === "") { flushPara(); flushList(); }
    else { flushList(); para.push(line); }
  }
  flushPara();
  flushList();
  return <div className="space-y-2">{blocks}</div>;
}
