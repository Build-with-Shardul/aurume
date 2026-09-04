"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { type Editor } from "@tiptap/react";
import { toEmbedUrl } from "./wiki-embed";
import { uploadWikiImage } from "./actions";
import type { RefPage } from "./pageref";

export const EMOJIS = ["😀", "😄", "😉", "😎", "🤔", "👍", "🙏", "🎉", "🔥", "✅", "❌", "⚠️", "💡", "📌", "⭐", "❤️", "🚀", "📝", "🐛", "✨"];

export const COLORS: { name: string; v: string | null }[] = [
  { name: "Default", v: null },
  { name: "Black", v: "#111827" },
  { name: "Gray", v: "#6b7280" },
  { name: "Light gray", v: "#9ca3af" },
  { name: "Slate", v: "#475569" },
  { name: "Brown", v: "#92400e" },
  { name: "Maroon", v: "#7f1d1d" },
  { name: "Red", v: "#dc2626" },
  { name: "Rose", v: "#e11d48" },
  { name: "Pink", v: "#db2777" },
  { name: "Fuchsia", v: "#c026d3" },
  { name: "Purple", v: "#9333ea" },
  { name: "Violet", v: "#7c3aed" },
  { name: "Indigo", v: "#4f46e5" },
  { name: "Blue", v: "#2563eb" },
  { name: "Sky", v: "#0284c7" },
  { name: "Cyan", v: "#0891b2" },
  { name: "Teal", v: "#0d9488" },
  { name: "Emerald", v: "#059669" },
  { name: "Green", v: "#16a34a" },
  { name: "Lime", v: "#65a30d" },
  { name: "Yellow", v: "#ca8a04" },
  { name: "Amber", v: "#d97706" },
  { name: "Orange", v: "#ea580c" },
];

export function Btn({ e, on, active, cls = "", title, children }: { e: Editor; on: () => void; active?: boolean; cls?: string; title: string; children: React.ReactNode }) {
  void e;
  return (
    <button
      onMouseDown={(ev) => ev.preventDefault()}
      onClick={on}
      title={title}
      className={`rounded px-2 py-1 text-sm leading-none transition-colors ${active ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100"} ${cls}`}
    >
      {children}
    </button>
  );
}

export function Sep() {
  return <span className="mx-1 h-4 w-px bg-neutral-200" />;
}

// Popover that closes on any outside click (capture-phase pointerdown) or Escape.
// `align` anchors the panel to the button's left (default) or right edge, so
// buttons near a container's right edge can open leftward and stay in the box.
export function Pop({ label, title, align = "left", children }: { label: React.ReactNode; title: string; align?: "left" | "right"; children: (close: () => void) => React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown, true); document.removeEventListener("keydown", onKey); };
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button onMouseDown={(e) => e.preventDefault()} onClick={() => setOpen((o) => !o)} title={title} className="rounded px-2 py-1 text-sm leading-none text-neutral-600 hover:bg-neutral-100">
        {label}
      </button>
      {open && (
        <div className={`absolute z-30 mt-1 rounded-lg border border-neutral-200 bg-white p-2 shadow-lg ${align === "right" ? "right-0" : "left-0"}`}>{children(() => setOpen(false))}</div>
      )}
    </div>
  );
}

export function MenuBtn({ onClick, danger, children }: { onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button onMouseDown={(e) => e.preventDefault()} onClick={onClick} className={`block w-full rounded px-2 py-1.5 text-left text-sm ${danger ? "text-red-600 hover:bg-red-50" : "text-neutral-700 hover:bg-neutral-50"}`}>
      {children}
    </button>
  );
}

export function ColorPop({ editor, align }: { editor: Editor; align?: "left" | "right" }) {
  return (
    <Pop align={align} label={<span className="font-semibold" style={{ color: editor.getAttributes("textStyle").color || "#111" }}>A</span>} title="Text color">
      {(close) => (
        <div className="flex w-[220px] flex-wrap gap-1">
          {COLORS.map((c) => (
            <button
              key={c.name}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { if (c.v) editor.chain().focus().setColor(c.v).run(); else editor.chain().focus().unsetColor().run(); close(); }}
              title={c.name}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-neutral-200 text-xs font-semibold hover:ring-2 hover:ring-neutral-300"
              style={{ color: c.v || "#111" }}
            >
              A
            </button>
          ))}
        </div>
      )}
    </Pop>
  );
}

export function EmojiPop({ editor, align }: { editor: Editor; align?: "left" | "right" }) {
  return (
    <Pop align={align} label="🙂" title="Emoji">
      {(close) => (
        <div className="grid w-48 grid-cols-6 gap-0.5">
          {EMOJIS.map((em) => (
            <button key={em} onMouseDown={(e) => e.preventDefault()} onClick={() => { editor.chain().focus().insertContent(em).run(); close(); }} className="rounded p-1 text-base hover:bg-neutral-100">
              {em}
            </button>
          ))}
        </div>
      )}
    </Pop>
  );
}

export function LinkPop({ editor, align }: { editor: Editor; align?: "left" | "right" }) {
  const [url, setUrl] = useState("");
  return (
    <Pop align={align} label="🔗" title="Link">
      {(close) => (
        <div className="w-56" onMouseDown={(e) => e.preventDefault()}>
          <input
            autoFocus
            defaultValue={editor.getAttributes("link").href || ""}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
            className="w-full rounded border border-neutral-300 px-2 py-1 text-sm outline-none focus:border-neutral-900"
          />
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => {
                const href = url.trim();
                if (!href) editor.chain().focus().unsetLink().run();
                else if (editor.state.selection.empty) editor.chain().focus().insertContent(`<a href="${href}">${href}</a>`).run();
                else editor.chain().focus().setLink({ href }).run();
                close();
              }}
              className="flex-1 rounded bg-neutral-900 px-2 py-1 text-xs font-medium text-white hover:bg-neutral-800"
            >
              Apply
            </button>
            <button onClick={() => { editor.chain().focus().unsetLink().run(); close(); }} className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50">Remove</button>
          </div>
        </div>
      )}
    </Pop>
  );
}

export function ImageButton({ editor }: { editor: Editor }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    const fd = new FormData();
    fd.append("file", file);
    const r = await uploadWikiImage(fd);
    setBusy(false);
    if (r && "url" in r && r.url) editor.chain().focus().setImage({ src: r.url }).run();
    else if (r && "error" in r) alert(r.error);
  }
  return (
    <>
      <button onMouseDown={(e) => e.preventDefault()} onClick={() => inputRef.current?.click()} title="Insert image" disabled={busy} className="rounded px-2 py-1 text-sm leading-none text-neutral-600 hover:bg-neutral-100 disabled:opacity-50">
        {busy ? "…" : "🖼"}
      </button>
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={onFile} />
    </>
  );
}

export function TableMenu({ editor, align }: { editor: Editor; align?: "left" | "right" }) {
  const inTable = editor.isActive("table");
  return (
    <Pop align={align} label="▦" title="Table">
      {(close) => (
        <div className="w-40">
          {!inTable ? (
            <MenuBtn onClick={() => { editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(); close(); }}>Insert table</MenuBtn>
          ) : (
            <>
              <MenuBtn onClick={() => editor.chain().focus().addRowAfter().run()}>Add row</MenuBtn>
              <MenuBtn onClick={() => editor.chain().focus().addColumnAfter().run()}>Add column</MenuBtn>
              <MenuBtn onClick={() => editor.chain().focus().deleteRow().run()}>Delete row</MenuBtn>
              <MenuBtn onClick={() => editor.chain().focus().deleteColumn().run()}>Delete column</MenuBtn>
              <MenuBtn danger onClick={() => { editor.chain().focus().deleteTable().run(); close(); }}>Delete table</MenuBtn>
            </>
          )}
        </div>
      )}
    </Pop>
  );
}

export function PageRefButton({ editor, pages, align }: { editor: Editor; pages: RefPage[]; align?: "left" | "right" }) {
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return pages.filter((p) => !t || (p.title || "Untitled").toLowerCase().includes(t)).slice(0, 30);
  }, [q, pages]);
  return (
    <Pop align={align} label="⧉" title="Link to another page ( [[ )">
      {(close) => (
        <div className="w-60" onMouseDown={(e) => e.preventDefault()}>
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search pages…"
            className="mb-1.5 w-full rounded border border-neutral-300 px-2 py-1 text-sm outline-none focus:border-neutral-900"
          />
          {list.length === 0 ? (
            <p className="px-1 py-1.5 text-xs text-neutral-400">No pages found.</p>
          ) : (
            <ul className="max-h-56 space-y-0.5 overflow-y-auto">
              {list.map((p) => (
                <li key={p.id}>
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      editor.chain().focus().insertContent([{ type: "pageRef", attrs: { pageId: p.id, label: p.title } }, { type: "text", text: " " }]).run();
                      close();
                    }}
                    className="block w-full truncate rounded px-2 py-1.5 text-left text-sm text-neutral-700 hover:bg-neutral-50"
                  >
                    ↗ {p.title || "Untitled"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Pop>
  );
}

export function EmbedPop({ editor, align }: { editor: Editor; align?: "left" | "right" }) {
  const [url, setUrl] = useState("");
  const [err, setErr] = useState("");
  return (
    <Pop align={align} label="🎬" title="Embed video (YouTube / Loom)">
      {(close) => (
        <div className="w-60" onMouseDown={(e) => e.preventDefault()}>
          <input
            autoFocus
            onChange={(e) => { setUrl(e.target.value); setErr(""); }}
            placeholder="YouTube or Loom URL"
            className="w-full rounded border border-neutral-300 px-2 py-1 text-sm outline-none focus:border-neutral-900"
          />
          {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
          <button
            onClick={() => {
              const src = toEmbedUrl(url);
              if (!src) { setErr("Only YouTube and Loom links are supported."); return; }
              editor.chain().focus().insertContent({ type: "wikiEmbed", attrs: { src } }).run();
              close();
            }}
            className="mt-2 w-full rounded bg-neutral-900 px-2 py-1 text-xs font-medium text-white hover:bg-neutral-800"
          >
            Embed
          </button>
        </div>
      )}
    </Pop>
  );
}
