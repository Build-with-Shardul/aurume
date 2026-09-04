import { Extension, type Editor, type Range } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import Suggestion from "@tiptap/suggestion";
import { domListRenderer } from "./suggest-popup";
import { createDiagram } from "../diagrams/actions";

type SlashCmd = { label: string; run: (editor: Editor, range: Range) => void };

// Type "/" in a wiki page to open a block menu. "/diagram" creates and embeds a diagram.
const COMMANDS: SlashCmd[] = [
  {
    label: "Diagram",
    run: (editor, range) => {
      editor.chain().focus().deleteRange(range).run();
      createDiagram().then((r) => {
        if (r && "id" in r && r.id) {
          editor.chain().focus().insertContent({ type: "diagramEmbed", attrs: { diagramId: r.id, title: "Untitled diagram" } }).run();
        }
      });
    },
  },
  { label: "Table", run: (editor, range) => editor.chain().focus().deleteRange(range).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
  { label: "Bullet list", run: (editor, range) => editor.chain().focus().deleteRange(range).toggleBulletList().run() },
  { label: "Numbered list", run: (editor, range) => editor.chain().focus().deleteRange(range).toggleOrderedList().run() },
  { label: "Quote", run: (editor, range) => editor.chain().focus().deleteRange(range).toggleBlockquote().run() },
  { label: "Code block", run: (editor, range) => editor.chain().focus().deleteRange(range).toggleCodeBlock().run() },
  { label: "Divider", run: (editor, range) => editor.chain().focus().deleteRange(range).setHorizontalRule().run() },
];

export function buildSlash() {
  return Extension.create({
    name: "slashCommands",
    addProseMirrorPlugins() {
      return [
        Suggestion<SlashCmd>({
          editor: this.editor,
          pluginKey: new PluginKey("slashSuggestion"),
          char: "/",
          startOfLine: false,
          allowSpaces: false,
          items: ({ query }) => {
            const q = query.toLowerCase();
            return COMMANDS.filter((c) => c.label.toLowerCase().includes(q)).slice(0, 8);
          },
          render: domListRenderer<SlashCmd>((c) => c, (c) => c.label),
          command: ({ editor, range, props }) => { (props as unknown as SlashCmd).run(editor, range); },
        }),
      ];
    },
  });
}
