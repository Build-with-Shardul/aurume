"use client";

import { useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { buildMention, type MentionUser } from "../mention";

/** A compact one-box composer that supports @mentions (type "@" to pick a person).
 * Reports its HTML + emptiness up; the parent owns the submit button. */
export default function MentionInput({
  users,
  placeholder,
  autoFocus,
  onChange,
  onEnter,
}: {
  users: MentionUser[];
  placeholder: string;
  autoFocus?: boolean;
  onChange: (html: string, empty: boolean) => void;
  onEnter?: () => void;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder }),
      buildMention(users),
    ],
    content: "",
    autofocus: autoFocus ? "end" : false,
    immediatelyRender: false,
    editorProps: {
      attributes: { class: "wiki-prose min-h-[38px] px-2.5 py-1.5 text-sm outline-none" },
      handleKeyDown: (_view, event) => {
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); onEnter?.(); return true; }
        return false;
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML(), editor.isEmpty),
  });
  useEffect(() => () => editor?.destroy(), [editor]);

  return <EditorContent editor={editor} />;
}
