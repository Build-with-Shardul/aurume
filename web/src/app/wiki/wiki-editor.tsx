"use client";

import { useEffect, useState } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";

export default function WikiEditor({
  content,
  editable,
  onChange,
}: {
  content: unknown;
  editable: boolean;
  onChange: (json: unknown, text: string) => void;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: "Start writing…  (or use the toolbar / markdown shortcuts: # H1, - list, > quote, ``` code)" }),
    ],
    content: (content as object) ?? "",
    editable,
    immediatelyRender: false, // avoid Next SSR hydration mismatch
    editorProps: { attributes: { class: "wiki-prose min-h-[320px]" } },
    onUpdate: ({ editor }) => onChange(editor.getJSON(), editor.getText()),
  });

  useEffect(() => () => editor?.destroy(), [editor]);

  return (
    <div>
      {editable && <Toolbar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor | null }) {
  // Re-render on every editor transaction so active states stay in sync.
  const [, force] = useState(0);
  useEffect(() => {
    if (!editor) return;
    const on = () => force((n) => n + 1);
    editor.on("transaction", on);
    return () => { editor.off("transaction", on); };
  }, [editor]);

  if (!editor) return null;

  const cls = (active: boolean) =>
    `rounded px-2 py-1 text-sm leading-none transition-colors ${
      active ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100"
    }`;
  // preventDefault on mousedown keeps the editor selection while clicking a button
  const hold = (e: React.MouseEvent) => e.preventDefault();

  return (
    <div className="sticky top-0 z-10 mb-3 flex flex-wrap items-center gap-0.5 border-b border-neutral-200 bg-white/95 py-1.5 backdrop-blur">
      <button onMouseDown={hold} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} className={cls(editor.isActive("heading", { level: 1 }))} title="Heading 1">H1</button>
      <button onMouseDown={hold} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={cls(editor.isActive("heading", { level: 2 }))} title="Heading 2">H2</button>
      <button onMouseDown={hold} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} className={cls(editor.isActive("heading", { level: 3 }))} title="Heading 3">H3</button>
      <Sep />
      <button onMouseDown={hold} onClick={() => editor.chain().focus().toggleBold().run()} className={`${cls(editor.isActive("bold"))} font-bold`} title="Bold">B</button>
      <button onMouseDown={hold} onClick={() => editor.chain().focus().toggleItalic().run()} className={`${cls(editor.isActive("italic"))} italic`} title="Italic">I</button>
      <button onMouseDown={hold} onClick={() => editor.chain().focus().toggleStrike().run()} className={`${cls(editor.isActive("strike"))} line-through`} title="Strikethrough">S</button>
      <button onMouseDown={hold} onClick={() => editor.chain().focus().toggleCode().run()} className={`${cls(editor.isActive("code"))} font-mono`} title="Inline code">{"</>"}</button>
      <Sep />
      <button onMouseDown={hold} onClick={() => editor.chain().focus().toggleBulletList().run()} className={cls(editor.isActive("bulletList"))} title="Bullet list">• List</button>
      <button onMouseDown={hold} onClick={() => editor.chain().focus().toggleOrderedList().run()} className={cls(editor.isActive("orderedList"))} title="Numbered list">1. List</button>
      <button onMouseDown={hold} onClick={() => editor.chain().focus().toggleBlockquote().run()} className={cls(editor.isActive("blockquote"))} title="Quote">❝ Quote</button>
      <button onMouseDown={hold} onClick={() => editor.chain().focus().toggleCodeBlock().run()} className={cls(editor.isActive("codeBlock"))} title="Code block">Code</button>
    </div>
  );
}

function Sep() {
  return <span className="mx-1 h-4 w-px bg-neutral-200" />;
}
