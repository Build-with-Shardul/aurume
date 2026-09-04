"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle, Color } from "@tiptap/extension-text-style";
import { Table, TableRow, TableHeader, TableCell } from "@tiptap/extension-table";
import Image from "@tiptap/extension-image";
import { WikiEmbed } from "./wiki-embed";
import { CommentMark } from "./comment-mark";
import { buildPageRef, type RefPage } from "./pageref";
import { buildDiagramEmbed, type EmbedDiagram } from "./diagram-embed";
import { buildSlash } from "./slash";
import { addInlineComment, addComment, deleteComment } from "./actions";
import { Btn, Sep, ColorPop, EmojiPop, LinkPop, ImageButton, EmbedPop, TableMenu, PageRefButton, DiagramButton } from "./editor-kit";
import InlineThreadPopover, { type PopPos } from "./[id]/inline-thread-popover";
import type { CommentItem, ShareUser } from "@/lib/wiki";

export type InlineThread = { id: string; quote: string | null; items: CommentItem[] };

type ActiveThread = { mode: "create" | "view"; rootId?: string; from?: number; to?: number; quote: string; pos: PopPos };

export default function WikiEditor({
  docId,
  content,
  editable,
  onChange,
  inlineThreads,
  currentUserId,
  mentionableUsers,
  pageRefs,
  diagrams,
}: {
  docId: string;
  content: unknown;
  editable: boolean;
  onChange: (json: unknown, text: string) => void;
  inlineThreads: InlineThread[];
  currentUserId: string;
  mentionableUsers: ShareUser[];
  pageRefs: RefPage[];
  diagrams: EmbedDiagram[];
}) {
  const router = useRouter();
  const [active, setActive] = useState<ActiveThread | null>(null);
  const [busy, setBusy] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false, HTMLAttributes: { class: "wiki-link" } } }),
      Placeholder.configure({ placeholder: "Start writing…  (or use the toolbar / markdown shortcuts: # H1, - list, > quote, ``` code)" }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TextStyle,
      Color,
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Image.configure({ HTMLAttributes: { class: "wiki-image" } }),
      WikiEmbed,
      CommentMark,
      buildPageRef(pageRefs),
      buildDiagramEmbed(diagrams),
      buildSlash(),
    ],
    content: (content as object) ?? "",
    editable,
    immediatelyRender: false,
    editorProps: { attributes: { class: "wiki-prose min-h-[320px]" } },
    onUpdate: ({ editor }) => onChange(editor.getJSON(), editor.getText()),
  });

  useEffect(() => () => editor?.destroy(), [editor]);

  // Position the popover below the anchored range by default (so a first-line
  // comment never lands behind the sticky toolbar); flip above only when there's
  // no room below.
  function computePos(rect: { left: number; right: number; top: number; bottom: number }): PopPos {
    const vw = window.innerWidth, vh = window.innerHeight;
    const tb = document.querySelector("[data-wiki-toolbar]")?.getBoundingClientRect();
    const safeTop = (tb ? tb.bottom : 0) + 8;
    const W = 320;
    const left = Math.min(Math.max(rect.left, 8), Math.max(8, vw - W - 8));
    const below = vh - rect.bottom > 260 || rect.top - safeTop < 260;
    if (below) {
      const top = Math.max(rect.bottom + 8, safeTop);
      return { left, top, maxHeight: Math.max(120, vh - top - 110) };
    }
    const bottom = vh - rect.top + 8;
    return { left, bottom, maxHeight: Math.max(120, vh - bottom - 110) };
  }

  // Selection → open the composer to create a new inline thread.
  function startComment() {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    if (from === to) return;
    const a = editor.view.coordsAtPos(from), b = editor.view.coordsAtPos(to);
    const rect = { left: Math.min(a.left, b.left), right: Math.max(a.right, b.right), top: Math.min(a.top, b.top), bottom: Math.max(a.bottom, b.bottom) };
    setActive({ mode: "create", from, to, quote: editor.state.doc.textBetween(from, to, " "), pos: computePos(rect) });
  }

  // Click a page reference / diagram → navigate (plain click in read mode; ⌘/Ctrl-click while editing).
  function onEditorClick(e: React.MouseEvent) {
    const dia = (e.target as HTMLElement).closest("[data-diagram-embed]") as HTMLElement | null;
    if (dia) {
      const did = dia.getAttribute("data-diagram-embed");
      if (did && (!editable || e.metaKey || e.ctrlKey)) { e.preventDefault(); router.push(`/diagrams/${did}`); return; }
      if (did && editable) return;
    }
    const ref = (e.target as HTMLElement).closest("[data-page-ref]") as HTMLElement | null;
    if (ref) {
      const pid = ref.getAttribute("data-page-ref");
      if (pid && (!editable || e.metaKey || e.ctrlKey)) { e.preventDefault(); router.push(`/wiki/${pid}`); return; }
      if (pid && editable) return; // editing: let the cursor land, ⌘-click to open
    }
    const el = (e.target as HTMLElement).closest("[data-comment-id]") as HTMLElement | null;
    const cid = el?.getAttribute("data-comment-id");
    if (!cid || !el) return;
    const thread = inlineThreads.find((t) => t.id === cid);
    setActive({ mode: "view", rootId: cid, quote: thread?.quote ?? "", pos: computePos(el.getBoundingClientRect()) });
  }

  // Remove a specific comment highlight from the body (used when its root thread is deleted).
  function removeCommentMark(commentId: string) {
    if (!editor) return;
    const type = editor.state.schema.marks.comment;
    if (!type) return;
    const tr = editor.state.tr;
    let found = false;
    editor.state.doc.descendants((node, pos) => {
      if (!node.isText) return;
      if (node.marks.some((m) => m.type === type && m.attrs.commentId === commentId)) {
        tr.removeMark(pos, pos + node.nodeSize, type);
        found = true;
      }
    });
    if (found) editor.view.dispatch(tr);
  }

  async function submitActive(text: string) {
    if (!active || busy) return;
    setBusy(true);
    if (active.mode === "create" && editor && active.from != null && active.to != null) {
      const r = await addInlineComment(docId, active.quote, text);
      if (r && "id" in r && r.id) {
        editor.chain().focus().setTextSelection({ from: active.from, to: active.to }).setMark("comment", { commentId: r.id }).run();
        setActive({ mode: "view", rootId: r.id, quote: active.quote, pos: active.pos });
        router.refresh();
      }
    } else if (active.mode === "view" && active.rootId) {
      await addComment(docId, active.rootId, text);
      router.refresh();
    }
    setBusy(false);
  }

  async function deleteInline(id: string) {
    setBusy(true);
    await deleteComment(id);
    setBusy(false);
    if (active?.rootId === id) {
      if (editable) removeCommentMark(id); // deleting the root clears its highlight
      setActive(null);
    }
    router.refresh();
  }

  const activeItems = active?.mode === "view" && active.rootId ? inlineThreads.find((t) => t.id === active.rootId)?.items ?? [] : [];

  return (
    <div>
      {editable && <Toolbar editor={editor} pageRefs={pageRefs} diagrams={diagrams} />}
      {editable && editor && (
        <BubbleMenu editor={editor} options={{ placement: "bottom", offset: 8, flip: { padding: 88 } }} shouldShow={({ editor: e, from, to }) => e.isEditable && from !== to}>
          <button onMouseDown={(ev) => ev.preventDefault()} onClick={startComment} className="rounded-lg bg-neutral-900 px-2.5 py-1 text-xs font-medium text-white shadow-lg hover:bg-neutral-800">
            💬 Comment
          </button>
        </BubbleMenu>
      )}
      <div onClick={onEditorClick}>
        <EditorContent editor={editor} />
      </div>

      {active && (
        <InlineThreadPopover
          pos={active.pos}
          quote={active.quote}
          items={activeItems}
          currentUserId={currentUserId}
          mentionableUsers={mentionableUsers}
          busy={busy}
          onSubmit={submitActive}
          onDelete={deleteInline}
          onClose={() => setActive(null)}
        />
      )}
    </div>
  );
}

function Toolbar({ editor, pageRefs, diagrams }: { editor: Editor | null; pageRefs: RefPage[]; diagrams: EmbedDiagram[] }) {
  const [, force] = useState(0);
  useEffect(() => {
    if (!editor) return;
    const on = () => force((n) => n + 1);
    editor.on("transaction", on);
    return () => { editor.off("transaction", on); };
  }, [editor]);

  if (!editor) return null;

  return (
    <div data-wiki-toolbar className="sticky top-0 z-10 mb-3 flex flex-wrap items-center gap-0.5 border-b border-neutral-200 bg-white/95 py-1.5 backdrop-blur">
      <Btn e={editor} on={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive("heading", { level: 1 })} title="Heading 1">H1</Btn>
      <Btn e={editor} on={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive("heading", { level: 2 })} title="Heading 2">H2</Btn>
      <Btn e={editor} on={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive("heading", { level: 3 })} title="Heading 3">H3</Btn>
      <Btn e={editor} on={() => editor.chain().focus().setParagraph().run()} active={editor.isActive("paragraph")} title="Paragraph">P</Btn>
      <Sep />
      <Btn e={editor} on={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")} cls="font-bold" title="Bold">B</Btn>
      <Btn e={editor} on={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")} cls="italic" title="Italic">I</Btn>
      <Btn e={editor} on={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive("underline")} cls="underline" title="Underline">U</Btn>
      <Btn e={editor} on={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive("strike")} cls="line-through" title="Strikethrough">S</Btn>
      <Btn e={editor} on={() => editor.chain().focus().toggleCode().run()} active={editor.isActive("code")} cls="font-mono" title="Inline code">{"</>"}</Btn>
      <ColorPop editor={editor} />
      <Sep />
      <Btn e={editor} on={() => editor.chain().focus().setTextAlign("left").run()} active={editor.isActive({ textAlign: "left" })} title="Align left">⇤</Btn>
      <Btn e={editor} on={() => editor.chain().focus().setTextAlign("center").run()} active={editor.isActive({ textAlign: "center" })} title="Align center">≡</Btn>
      <Btn e={editor} on={() => editor.chain().focus().setTextAlign("right").run()} active={editor.isActive({ textAlign: "right" })} title="Align right">⇥</Btn>
      <Sep />
      <Btn e={editor} on={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")} title="Bullet list">• List</Btn>
      <Btn e={editor} on={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")} title="Numbered list">1. List</Btn>
      <Btn e={editor} on={() => editor.chain().focus().sinkListItem("listItem").run()} title="Indent (move right)">→|</Btn>
      <Btn e={editor} on={() => editor.chain().focus().liftListItem("listItem").run()} title="Outdent (move left)">|←</Btn>
      <Sep />
      <Btn e={editor} on={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive("blockquote")} title="Quote">❝</Btn>
      <Btn e={editor} on={() => editor.chain().focus().toggleCodeBlock().run()} active={editor.isActive("codeBlock")} title="Code block">Code</Btn>
      <LinkPop editor={editor} />
      <PageRefButton editor={editor} pages={pageRefs} />
      <EmojiPop editor={editor} />
      <TableMenu editor={editor} />
      <ImageButton editor={editor} />
      <EmbedPop editor={editor} />
      <DiagramButton editor={editor} diagrams={diagrams} />
    </div>
  );
}
