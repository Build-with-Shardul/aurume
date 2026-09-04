"use client";

import { useEffect, useState } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle, Color } from "@tiptap/extension-text-style";
import { Table, TableRow, TableHeader, TableCell } from "@tiptap/extension-table";
import Image from "@tiptap/extension-image";
import { WikiEmbed } from "./wiki-embed";
import { Btn, Sep, ColorPop, EmojiPop, LinkPop, ImageButton, EmbedPop, TableMenu } from "./editor-kit";

// The extension set shared by the comment composer and the read-only renderer:
// the same rich blocks as the page (headings, lists, table, color, alignment,
// links, image, video).
function commentExtensions(placeholder?: string) {
  return [
    StarterKit.configure({ link: { openOnClick: false, HTMLAttributes: { class: "wiki-link" } } }),
    ...(placeholder ? [Placeholder.configure({ placeholder })] : []),
    TextAlign.configure({ types: ["paragraph", "heading"] }),
    TextStyle,
    Color,
    Table.configure({ resizable: true }),
    TableRow,
    TableHeader,
    TableCell,
    Image.configure({ HTMLAttributes: { class: "wiki-image" } }),
    WikiEmbed,
  ];
}

/**
 * Safely render stored comment HTML. Parsing through the TipTap schema drops any
 * unknown tags/attributes and never executes scripts, so it neutralises arbitrary
 * HTML the same way the page body is rendered. Plain-text (legacy) comments render
 * as a single paragraph.
 */
export function CommentContent({ html }: { html: string }) {
  const editor = useEditor({
    extensions: commentExtensions(),
    content: html || "",
    editable: false,
    immediatelyRender: false,
    editorProps: { attributes: { class: "wiki-prose text-sm text-neutral-700" } },
  });
  useEffect(() => () => editor?.destroy(), [editor]);
  return <EditorContent editor={editor} />;
}

export function CommentComposer({
  placeholder,
  busy,
  autoFocus,
  onSubmit,
}: {
  placeholder: string;
  busy: boolean;
  autoFocus?: boolean;
  onSubmit: (html: string, done: () => void) => void;
}) {
  const editor = useEditor({
    extensions: commentExtensions(placeholder),
    content: "",
    autofocus: autoFocus ? "end" : false,
    immediatelyRender: false,
    editorProps: { attributes: { class: "wiki-prose min-h-[44px] px-3 py-2 text-sm" } },
  });
  useEffect(() => () => editor?.destroy(), [editor]);

  const [, force] = useState(0);
  useEffect(() => {
    if (!editor) return;
    const on = () => force((n) => n + 1);
    editor.on("transaction", on);
    return () => { editor.off("transaction", on); };
  }, [editor]);

  const empty = !editor || editor.isEmpty;

  function submit() {
    if (!editor || empty || busy) return;
    onSubmit(editor.getHTML(), () => editor.commands.clearContent(true));
  }

  return (
    <div className="rounded-lg border border-neutral-300 focus-within:border-neutral-900">
      {editor && <CommentToolbar editor={editor} />}
      <EditorContent editor={editor} />
      <div className="flex justify-end border-t border-neutral-100 px-2 py-1.5">
        <button
          onClick={submit}
          disabled={busy || empty}
          className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-40"
        >
          Comment
        </button>
      </div>
    </div>
  );
}

function CommentToolbar({ editor }: { editor: Editor }) {
  return (
    <div className="flex flex-wrap items-center gap-0.5 rounded-t-lg border-b border-neutral-200 bg-neutral-50/80 px-1.5 py-1">
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
      <Sep />
      <LinkPop editor={editor} align="right" />
      <EmojiPop editor={editor} align="right" />
      <TableMenu editor={editor} align="right" />
      <ImageButton editor={editor} />
      <EmbedPop editor={editor} align="right" />
    </div>
  );
}
