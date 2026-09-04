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
import { addInlineComment } from "./actions";
import { Btn, Sep, Pop, MenuBtn, ColorPop, EmojiPop, LinkPop, ImageButton, EmbedPop } from "./editor-kit";

export default function WikiEditor({
  docId,
  content,
  editable,
  onChange,
}: {
  docId: string;
  content: unknown;
  editable: boolean;
  onChange: (json: unknown, text: string) => void;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<{ from: number; to: number; quote: string } | null>(null);
  const [commentBody, setCommentBody] = useState("");
  const [saving, setSaving] = useState(false);

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
    ],
    content: (content as object) ?? "",
    editable,
    immediatelyRender: false,
    editorProps: { attributes: { class: "wiki-prose min-h-[320px]" } },
    onUpdate: ({ editor }) => onChange(editor.getJSON(), editor.getText()),
  });

  useEffect(() => () => editor?.destroy(), [editor]);

  function startComment() {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    if (from === to) return;
    setDraft({ from, to, quote: editor.state.doc.textBetween(from, to, " ") });
    setCommentBody("");
  }

  async function submitComment() {
    if (!editor || !draft || !commentBody.trim() || saving) return;
    setSaving(true);
    const r = await addInlineComment(docId, draft.quote, commentBody);
    setSaving(false);
    if (r && "id" in r && r.id) {
      editor.chain().focus().setTextSelection({ from: draft.from, to: draft.to }).setMark("comment", { commentId: r.id }).run();
      router.refresh();
    }
    setDraft(null);
    setCommentBody("");
  }

  // Click a highlighted range → scroll its thread into view in the comments section.
  function onEditorClick(e: React.MouseEvent) {
    const el = (e.target as HTMLElement).closest("[data-comment-id]");
    const cid = el?.getAttribute("data-comment-id");
    if (cid) document.getElementById(`comment-${cid}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <div>
      {editable && <Toolbar editor={editor} />}
      {editable && editor && (
        <BubbleMenu editor={editor} shouldShow={({ editor: e, from, to }) => e.isEditable && from !== to}>
          <button onMouseDown={(ev) => ev.preventDefault()} onClick={startComment} className="rounded-lg bg-neutral-900 px-2.5 py-1 text-xs font-medium text-white shadow-lg hover:bg-neutral-800">
            💬 Comment
          </button>
        </BubbleMenu>
      )}
      <div onClick={onEditorClick}>
        <EditorContent editor={editor} />
      </div>

      {draft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setDraft(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-sm font-semibold text-neutral-900">Comment on selection</h2>
            <p className="mt-1 line-clamp-2 rounded bg-yellow-50 px-2 py-1 text-xs italic text-neutral-600">&ldquo;{draft.quote}&rdquo;</p>
            <textarea
              autoFocus
              value={commentBody}
              onChange={(e) => setCommentBody(e.target.value)}
              rows={3}
              placeholder="Add your comment…"
              className="mt-3 w-full resize-none rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button onClick={() => setDraft(null)} className="rounded-lg px-3 py-1.5 text-sm font-medium text-neutral-600 hover:bg-neutral-100">Cancel</button>
              <button onClick={submitComment} disabled={saving || !commentBody.trim()} className="rounded-lg bg-neutral-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-40">
                {saving ? "Adding…" : "Comment"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor | null }) {
  const [, force] = useState(0);
  useEffect(() => {
    if (!editor) return;
    const on = () => force((n) => n + 1);
    editor.on("transaction", on);
    return () => { editor.off("transaction", on); };
  }, [editor]);

  if (!editor) return null;
  const inTable = editor.isActive("table");

  return (
    <div className="sticky top-0 z-10 mb-3 flex flex-wrap items-center gap-0.5 border-b border-neutral-200 bg-white/95 py-1.5 backdrop-blur">
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
      <EmojiPop editor={editor} />
      <TableMenu editor={editor} inTable={inTable} />
      <ImageButton editor={editor} />
      <EmbedPop editor={editor} />
    </div>
  );
}

function TableMenu({ editor, inTable }: { editor: Editor; inTable: boolean }) {
  return (
    <Pop label="▦" title="Table">
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
